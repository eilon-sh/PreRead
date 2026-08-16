(() => {
  const GAME_META = {
    match: { title: 'התאמה', icon: '🔗', desc: 'התאם מילים להגדרות שלהן' },
    quiz: { title: 'בחירה מרובה', icon: '🎯', desc: 'בחר את התשובה הנכונה' },
  };

  let words = [];
  let currentGame = null;
  let score = { correct: 0, total: 0 };
  let quizIndex = 0;
  let matchPairs = [];
  let matchSolved = new Set();
  let matchLocked = false;

  const params = new URLSearchParams(window.location.search);
  const documentId = params.get('documentId') || '';
  const gamePicker = document.getElementById('gamePicker');
  const gameArea = document.getElementById('gameArea');
  const gameTitle = document.getElementById('gameTitle');
  const scoreBar = document.getElementById('scoreBar');
  const xpToast = document.getElementById('xpToast');
  const emptyState = document.getElementById('emptyState');

  // מערבב מערך בסדר אקראי
  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // מעדכן תצוגת ניקוד נוכחי
  function updateScore() {
    scoreBar.textContent = `ניקוד: ${score.correct} / ${score.total}`;
  }

  // מציג התראת XP והישגים
  function showXpToast(result) {
    if (!result?.xpGained) return;
    let msg = `+${result.xpGained} XP`;
    if (result.leveledUp) msg += ' · עלית רמה! 🎉';
    if (result.newAchievements?.length) {
      msg += `<br>${result.newAchievements.map((a) => `${a.icon} ${escapeHtml(a.name)}`).join('<br>')}`;
    }
    xpToast.innerHTML = msg;
    xpToast.classList.remove('hidden');
    setTimeout(() => xpToast.classList.add('hidden'), 2800);
  }

  // טוען מילים למשחק מהשרת
  async function loadWords() {
    const query = new URLSearchParams();
    if (documentId) query.set('documentId', documentId);
    query.set('limit', '30');

    const res = await apiFetch(`/api/v1/minigames/words?${query.toString()}`);
    if (isRateLimited(res)) return false;
    const data = await res.json();
    words = data.words || [];
    return words.length > 0;
  }

  // מדווח סיום משחק ומקבל XP
  async function completeSession(gameType) {
    if (score.total === 0) return;
    const res = await apiFetch('/api/v1/minigames/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        correct: score.correct,
        total: score.total,
        gameType,
      }),
    });
    if (res.ok) showXpToast(await res.json());
  }

  // מציג בחירת סוגי משחק
  function renderPicker() {
    gamePicker.innerHTML = Object.entries(GAME_META)
      .map(
        ([id, g]) => `
      <div class="col-sm-6 col-lg-4">
        <button class="game-card w-100 h-100" data-game="${id}" type="button">
          <span class="game-card-icon">${g.icon}</span>
          <strong>${g.title}</strong>
          <span class="text-muted small">${g.desc}</span>
        </button>
      </div>
    `,
      )
      .join('');

    gamePicker.querySelectorAll('.game-card').forEach((btn) => {
      btn.addEventListener('click', () => startGame(btn.dataset.game));
    });
  }

  // מתחיל משחק לפי סוג שנבחר
  async function startGame(type) {
    const hasWords = await loadWords();
    if (!hasWords) {
      emptyState.classList.remove('hidden');
      gameArea.classList.add('hidden');
      gameTitle.classList.add('hidden');
      scoreBar.classList.add('hidden');
      gamePicker.classList.add('hidden');
      return;
    }

    emptyState.classList.add('hidden');
    gamePicker.classList.add('hidden');
    gameArea.classList.remove('hidden');
    gameTitle.classList.remove('hidden');
    scoreBar.classList.remove('hidden');
    currentGame = type;
    score = { correct: 0, total: 0 };
    quizIndex = 0;
    gameTitle.textContent = GAME_META[type].title;
    updateScore();

    if (type === 'match') renderMatch();
    else if (type === 'quiz') renderQuiz();
  }

  // חוזר למסך בחירת משחק
  function backToPicker() {
    gameArea.classList.add('hidden');
    gameTitle.classList.add('hidden');
    scoreBar.classList.add('hidden');
    gamePicker.classList.remove('hidden');
    currentGame = null;
  }

  // מרנדר לוח משחק התאמה
  function renderMatch() {
    const count = Math.min(words.length, 6);
    matchPairs = shuffle(words).slice(0, count);
    matchSolved = new Set();
    matchLocked = false;
    const defs = shuffle(matchPairs.map((w) => ({ id: w.id, text: w.definition })));

    const optionsHtml = defs
      .map(
        (d) => `
          <button class="match-option" data-id="${d.id}" type="button">${escapeHtml(d.text)}</button>
        `,
      )
      .join('');

    gameArea.innerHTML = `
      <div class="game-header">
        <button class="btn btn-secondary btn-sm" id="backBtn" type="button">חזרה</button>
        <span class="game-progress">התאם ${count} זוגות</span>
      </div>
      <div class="match-rows">
        ${matchPairs
          .map(
            (w) => `
          <div class="match-row" data-word-id="${w.id}">
            <div class="match-row-word">${escapeHtml(w.word)}</div>
            <div class="match-row-options">${optionsHtml}</div>
          </div>
        `,
          )
          .join('')}
      </div>
      <div id="matchFeedback" class="game-feedback hidden"></div>
    `;

    document.getElementById('backBtn').onclick = backToPicker;

    gameArea.querySelectorAll('.match-option').forEach((btn) => {
      btn.addEventListener('click', () => handleMatchOptionClick(btn));
    });
  }

  // מנקה בחירה בשורת התאמה
  function clearRowSelection(row) {
    row.querySelectorAll('.match-option').forEach((opt) => {
      opt.classList.remove('selected');
    });
  }

  // מטפל בלחיצה על אפשרות התאמה
  function handleMatchOptionClick(btn) {
    if (matchLocked || btn.disabled) return;

    const row = btn.closest('.match-row');
    if (!row || row.classList.contains('solved') || btn.classList.contains('wrong-flash')) return;

    const feedback = document.getElementById('matchFeedback');
    const wordId = row.dataset.wordId;
    const defId = btn.dataset.id;

    // בחירה יחידה בתוך השורה
    clearRowSelection(row);
    btn.classList.add('selected');

    // מבטל בחירה כפולה של אותה הגדרה
    gameArea.querySelectorAll('.match-row:not(.solved)').forEach((otherRow) => {
      if (otherRow === row) return;
      otherRow.querySelectorAll(`.match-option.selected[data-id="${defId}"]`).forEach((opt) => {
        opt.classList.remove('selected');
      });
    });

    score.total++;

    if (defId === wordId) {
      score.correct++;
      matchSolved.add(wordId);
      row.classList.add('solved');
      btn.classList.remove('selected');
      btn.classList.add('solved');
      row.querySelectorAll('.match-option').forEach((opt) => {
        opt.disabled = true;
      });
      // משבית הגדרה שכבר הותאמה
      gameArea
        .querySelectorAll(`.match-row:not(.solved) .match-option[data-id="${defId}"]`)
        .forEach((opt) => {
          opt.disabled = true;
          opt.classList.remove('selected');
        });
      updateScore();
      feedback.classList.add('hidden');

      if (matchSolved.size === matchPairs.length) {
        setTimeout(() => finishGame('match'), 600);
      }
    } else {
      matchLocked = true;
      btn.classList.add('wrong-flash');
      feedback.classList.remove('hidden', 'correct');
      feedback.classList.add('wrong');
      feedback.textContent = 'לא נכון, נסה שוב';
      updateScore();
      setTimeout(() => {
        btn.classList.remove('selected', 'wrong-flash');
        matchLocked = false;
        feedback.classList.add('hidden');
      }, 700);
    }
  }

  // מרנדר שאלת חידון בחירה מרובה
  function renderQuiz() {
    const total = Math.min(words.length, 10);
    if (quizIndex >= total) return finishGame('quiz');

    const w = words[quizIndex];
    const distractors = shuffle(words.filter((x) => x.id !== w.id)).slice(0, 3);
    const options = shuffle([w, ...distractors]);

    gameArea.innerHTML = `
      <div class="game-header">
        <button class="btn btn-secondary btn-sm" id="backBtn" type="button">חזרה</button>
        <span class="game-progress">שאלה ${quizIndex + 1} מתוך ${total}</span>
      </div>
      <div class="game-card-play quiz-game">
        <p class="quiz-question">מה המילה?</p>
        <p class="quiz-definition">${escapeHtml(w.definition)}</p>
        <div class="quiz-options">
          ${options
            .map(
              (o) => `
            <button class="quiz-option" data-id="${o.id}" data-correct="${o.id === w.id}" type="button">
              ${escapeHtml(o.word)}
            </button>
          `,
            )
            .join('')}
        </div>
        <div id="quizFeedback" class="game-feedback hidden"></div>
        <button class="btn btn-secondary hidden" id="quizNext" type="button">הבא</button>
      </div>
    `;

    document.getElementById('backBtn').onclick = backToPicker;

    const feedback = document.getElementById('quizFeedback');
    const nextBtn = document.getElementById('quizNext');

    gameArea.querySelectorAll('.quiz-option').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.classList.contains('answered')) return;
        const ok = btn.dataset.correct === 'true';
        score.total++;
        if (ok) score.correct++;
        updateScore();

        gameArea.querySelectorAll('.quiz-option').forEach((b) => {
          b.classList.add('answered');
          if (b.dataset.correct === 'true') b.classList.add('correct');
          else if (b === btn && !ok) b.classList.add('wrong');
        });

        feedback.classList.remove('hidden', 'correct', 'wrong');
        feedback.classList.add(ok ? 'correct' : 'wrong');
        feedback.textContent = ok ? '✓ נכון!' : `✗ התשובה הנכונה מסומנת בירוק`;
        nextBtn.classList.remove('hidden');
      });
    });

    nextBtn.onclick = () => {
      quizIndex++;
      renderQuiz();
    };
  }

  // מציג מסך סיום משחק
  async function finishGame(type) {
    await completeSession(type);
    gameArea.innerHTML = `
      <div class="game-done">
        <h2>כל הכבוד! 🎉</h2>
        <p>סיימת את המשחק עם <strong>${score.correct}</strong> תשובות נכונות מתוך <strong>${score.total}</strong></p>
        <div class="game-done-actions">
          <button class="btn btn-primary" id="playAgain" type="button">שחק שוב</button>
          <button class="btn btn-secondary" id="backPicker" type="button">משחקים אחרים</button>
        </div>
      </div>
    `;
    document.getElementById('playAgain').onclick = () => startGame(type);
    document.getElementById('backPicker').onclick = backToPicker;
  }

  renderPicker();
})();
