(() => {
  const GAME_META = {
    fill: {
      title: 'השלם את החסר',
      icon: '✏️',
      desc: 'השלם את המילה החסרה במשפט',
    },
    match: { title: 'התאמה', icon: '🔗', desc: 'התאם מילים להגדרות שלהן' },
    quiz: { title: 'בחירה מרובה', icon: '🎯', desc: 'בחר את התשובה הנכונה' },
  };

  let words = [];
  let currentGame = null;
  let score = { correct: 0, total: 0 };
  let fillIndex = 0;
  let quizIndex = 0;
  let matchPairs = [];
  let matchSelected = null;
  let matchSolved = new Set();

  const cefrFilter = document.getElementById('cefrFilter');
  const docFilter = document.getElementById('docFilter');
  const gamePicker = document.getElementById('gamePicker');
  const gameArea = document.getElementById('gameArea');
  const gameTitle = document.getElementById('gameTitle');
  const scoreBar = document.getElementById('scoreBar');
  const xpToast = document.getElementById('xpToast');
  const emptyState = document.getElementById('emptyState');

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function normalize(s) {
    return (s || '')
      .trim()
      .toLowerCase()
      .replace(/[^\w\s'-]/g, '');
  }

  function updateScore() {
    scoreBar.textContent = `ניקוד: ${score.correct} / ${score.total}`;
  }

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

  async function loadDocuments() {
    const res = await apiFetch('/api/v1/documents');
    if (isRateLimited(res)) return;
    const docs = await res.json();
    docFilter.innerHTML =
      '<option value="">הכל</option>' +
      docs
        .filter((d) => d.processing_status === 'ready')
        .map((d) => {
          const short = truncateFilename(d.filename, 28);
          return `<option value="${d.id}" title="${escapeHtml(d.filename)}">${escapeHtml(short)}</option>`;
        })
        .join('');
  }

  async function loadWords() {
    const query = new URLSearchParams();
    if (cefrFilter.value) query.set('cefr', cefrFilter.value);
    if (docFilter.value) query.set('documentId', docFilter.value);
    query.set('limit', '30');

    const res = await apiFetch(`/api/v1/minigames/words?${query.toString()}`);
    if (isRateLimited(res)) return false;
    const data = await res.json();
    words = data.words || [];
    return words.length > 0;
  }

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

  function makeFillPrompt(word) {
    if (word.context) {
      const regex = new RegExp(`\\b${escapeRegex(word.word)}\\b`, 'i');
      if (regex.test(word.context)) {
        return {
          text: word.context.replace(regex, '_____'),
          hint: word.definition,
          answer: word.word,
        };
      }
    }
    return {
      text: `הגדרה: ${word.definition}`,
      hint: word.translation ? `תרגום: ${word.translation}` : `רמת ${word.cefr}`,
      answer: word.word,
      noContext: true,
    };
  }

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
    fillIndex = 0;
    quizIndex = 0;
    gameTitle.textContent = GAME_META[type].title;
    updateScore();

    if (type === 'fill') renderFillBlank();
    else if (type === 'match') renderMatch();
    else if (type === 'quiz') renderQuiz();
  }

  function backToPicker() {
    gameArea.classList.add('hidden');
    gameTitle.classList.add('hidden');
    scoreBar.classList.add('hidden');
    gamePicker.classList.remove('hidden');
    currentGame = null;
  }

  function renderFillBlank() {
    if (fillIndex >= Math.min(words.length, 10)) {
      return finishGame('fill');
    }

    const w = words[fillIndex];
    const q = makeFillPrompt(w);

    gameArea.innerHTML = `
      <div class="game-header">
        <button class="btn btn-secondary btn-sm" id="backBtn" type="button">← חזרה</button>
        <span class="game-progress">שאלה ${fillIndex + 1} מתוך ${Math.min(words.length, 10)}</span>
      </div>
      <div class="game-card-play fill-game">
        <p class="fill-prompt ${q.noContext ? 'fill-definition' : ''}">${escapeHtml(q.text)}</p>
        ${q.hint ? `<p class="fill-hint muted">${escapeHtml(q.hint)}</p>` : ''}
        <div class="fill-input-row d-flex gap-2 mb-3">
          <input type="text" id="fillAnswer" class="form-control fill-input" placeholder="הקלד את המילה..." autocomplete="off" autofocus>
          <button class="btn btn-primary" id="fillSubmit" type="button">בדוק</button>
        </div>
        <div id="fillFeedback" class="game-feedback hidden"></div>
        <button class="btn btn-secondary hidden" id="fillNext" type="button">הבא →</button>
      </div>
    `;

    document.getElementById('backBtn').onclick = backToPicker;

    const input = document.getElementById('fillAnswer');
    const feedback = document.getElementById('fillFeedback');
    const nextBtn = document.getElementById('fillNext');

    function check() {
      const userAnswer = normalize(input.value);
      const correctAnswer = normalize(q.answer);
      score.total++;
      const ok = userAnswer === correctAnswer;
      if (ok) score.correct++;
      updateScore();

      feedback.classList.remove('hidden', 'correct', 'wrong');
      feedback.classList.add(ok ? 'correct' : 'wrong');
      feedback.innerHTML = ok
        ? '✓ נכון!'
        : `✗ לא נכון. התשובה: <strong>${escapeHtml(w.word)}</strong>`;
      input.disabled = true;
      document.getElementById('fillSubmit').classList.add('hidden');
      nextBtn.classList.remove('hidden');
    }

    document.getElementById('fillSubmit').onclick = check;
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') check();
    });
    nextBtn.onclick = () => {
      fillIndex++;
      renderFillBlank();
    };
  }

  function renderMatch() {
    const count = Math.min(words.length, 6);
    matchPairs = shuffle(words).slice(0, count);
    matchSelected = null;
    matchSolved = new Set();
    const defs = shuffle(matchPairs.map((w) => ({ id: w.id, text: w.definition })));

    gameArea.innerHTML = `
      <div class="game-header">
        <button class="btn btn-secondary btn-sm" id="backBtn" type="button">← חזרה</button>
        <span class="game-progress">התאם ${count} זוגות</span>
      </div>
      <div class="match-board">
        <div class="match-col" id="matchWords">
          ${matchPairs
            .map(
              (w) => `
            <button class="match-item" data-id="${w.id}" data-side="word" type="button">${escapeHtml(w.word)}</button>
          `,
            )
            .join('')}
        </div>
        <div class="match-col" id="matchDefs">
          ${defs
            .map(
              (d) => `
            <button class="match-item" data-id="${d.id}" data-side="def" type="button">${escapeHtml(d.text)}</button>
          `,
            )
            .join('')}
        </div>
      </div>
      <div id="matchFeedback" class="game-feedback hidden"></div>
    `;

    document.getElementById('backBtn').onclick = backToPicker;

    gameArea.querySelectorAll('.match-item').forEach((btn) => {
      btn.addEventListener('click', () => handleMatchClick(btn));
    });
  }

  function handleMatchClick(btn) {
    if (btn.classList.contains('solved') || btn.classList.contains('wrong-flash')) return;

    const feedback = document.getElementById('matchFeedback');

    if (!matchSelected) {
      matchSelected = btn;
      btn.classList.add('selected');
      return;
    }

    if (matchSelected === btn) {
      btn.classList.remove('selected');
      matchSelected = null;
      return;
    }

    if (matchSelected.dataset.side === btn.dataset.side) {
      matchSelected.classList.remove('selected');
      matchSelected = btn;
      btn.classList.add('selected');
      return;
    }

    const id1 = matchSelected.dataset.id;
    const id2 = btn.dataset.id;
    score.total++;

    if (id1 === id2) {
      score.correct++;
      matchSolved.add(id1);
      matchSelected.classList.remove('selected');
      matchSelected.classList.add('solved');
      btn.classList.add('solved');
      matchSelected = null;
      updateScore();
      feedback.classList.add('hidden');

      if (matchSolved.size === matchPairs.length) {
        setTimeout(() => finishGame('match'), 600);
      }
    } else {
      matchSelected.classList.add('wrong-flash');
      btn.classList.add('wrong-flash');
      feedback.classList.remove('hidden', 'correct');
      feedback.classList.add('wrong');
      feedback.textContent = 'לא נכון, נסה שוב';
      const prev = matchSelected;
      setTimeout(() => {
        prev.classList.remove('selected', 'wrong-flash');
        btn.classList.remove('wrong-flash');
        matchSelected = null;
        feedback.classList.add('hidden');
      }, 700);
      updateScore();
    }
  }

  function renderQuiz() {
    const total = Math.min(words.length, 10);
    if (quizIndex >= total) return finishGame('quiz');

    const w = words[quizIndex];
    const distractors = shuffle(words.filter((x) => x.id !== w.id)).slice(0, 3);
    const options = shuffle([w, ...distractors]);

    gameArea.innerHTML = `
      <div class="game-header">
        <button class="btn btn-secondary btn-sm" id="backBtn" type="button">← חזרה</button>
        <span class="game-progress">שאלה ${quizIndex + 1} מתוך ${total}</span>
      </div>
      <div class="game-card-play quiz-game">
        <p class="quiz-question">מה המילה?</p>
        <p class="quiz-definition">${escapeHtml(w.definition)}</p>
        ${w.translation ? `<p class="quiz-hint muted">רמז: ${escapeHtml(w.translation)}</p>` : ''}
        <div class="quiz-options">
          ${options
            .map(
              (o) => `
            <button class="quiz-option" data-id="${o.id}" data-correct="${o.id === w.id}" type="button">
              ${escapeHtml(o.word)}
              <span class="cefr-badge cefr-${escapeHtml(o.cefr)}">${escapeHtml(o.cefr)}</span>
            </button>
          `,
            )
            .join('')}
        </div>
        <div id="quizFeedback" class="game-feedback hidden"></div>
        <button class="btn btn-secondary hidden" id="quizNext" type="button">הבא →</button>
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

  cefrFilter.addEventListener('change', () => {
    if (currentGame) startGame(currentGame);
  });

  docFilter.addEventListener('change', () => {
    if (currentGame) startGame(currentGame);
  });

  loadDocuments().then(renderPicker);
})();
