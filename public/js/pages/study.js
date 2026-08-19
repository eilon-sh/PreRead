(() => {
  let cards = [];
  let currentIndex = 0;
  let revealed = false;
  let dueToday = 0;
  let total = 0;

  const flashcardArea = document.getElementById('flashcardArea');
  const dueCount = document.getElementById('dueCount');
  const urlParams = new URLSearchParams(window.location.search);

  // מציג מונה כרטיסים ממתינים וסה״כ
  function renderStats() {
    dueCount.innerHTML = `
      <span class="study-stat-chip">
        <span class="study-stat-value">${dueToday}</span>
        <span class="study-stat-label">ממתינים היום</span>
      </span>
      <span class="study-stat-chip">
        <span class="study-stat-value">${total}</span>
        <span class="study-stat-label">סה״כ</span>
      </span>
    `;
  }

  // טוען סטטיסטיקות לימוד (ממתינים, סה״כ)
  async function loadStats() {
    const reviewRes = await apiFetch('/api/v1/reviews/stats');
    if (isRateLimited(reviewRes)) return;
    const stats = await reviewRes.json();
    dueToday = stats.dueToday;
    total = stats.total;
    renderStats();
  }

  // מציג התראת XP והישגים
  function showXpToast(game) {
    const toast = document.getElementById('xpToast');
    let msg = `+${game.xpGained} XP`;
    if (game.leveledUp) msg += ' · עלית רמה! 🎉';
    if (game.newAchievements?.length) {
      msg += `<br>${game.newAchievements.map((a) => `${a.icon} ${escapeHtml(a.name)}`).join('<br>')}`;
    }
    toast.innerHTML = msg;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 2500);
  }

  // טוען כרטיסים שממתינים לחזרה
  async function loadCards() {
    const query = new URLSearchParams();
    if (urlParams.get('documentId')) query.set('documentId', urlParams.get('documentId'));

    const res = await apiFetch(`/api/v1/reviews/due?${query.toString()}`);
    if (isRateLimited(res)) {
      flashcardArea.innerHTML = `<div class="card-body">${rateLimitPlaceholder()}</div>`;
      return;
    }
    const data = await res.json();
    cards = data.cards;
    currentIndex = 0;
    revealed = false;
    renderCard();
    loadStats();
  }

  // מציג כרטיס נוכחי או סיום
  function renderCard() {
    if (cards.length === 0) {
      flashcardArea.innerHTML = `
        <div class="card-body flashcard-done py-5">
          <h2 class="h4">כל הכבוד!</h2>
          <p class="mb-0">אין כרטיסים ממתינים כרגע. חזור מחר או <a href="/upload">העלה מסמך חדש</a>.</p>
        </div>
      `;
      return;
    }

    if (currentIndex >= cards.length) {
      if (dueToday > 0) {
        flashcardArea.innerHTML = `
          <div class="card-body flashcard-done py-5">
            <h2 class="h4">סיימת את הסבב!</h2>
            <p>עברת על ${cards.length} כרטיסים בסבב זה.</p>
            <p>נשארו עוד <strong>${dueToday}</strong> כרטיסים ממתינים היום.</p>
            <button class="btn btn-primary" id="nextBatchBtn" type="button">המשך לקבוצה הבאה</button>
          </div>
        `;
        document.getElementById('nextBatchBtn')?.addEventListener('click', loadCards);
      } else {
        flashcardArea.innerHTML = `
          <div class="card-body flashcard-done py-5">
            <h2 class="h4">כל הכבוד!</h2>
            <p class="mb-0">סיימת את כל הכרטיסים להיום! חזור מחר או <a href="/upload">העלה מסמך חדש</a>.</p>
          </div>
        `;
      }
      return;
    }

    const card = cards[currentIndex];

    flashcardArea.innerHTML = `
      <div class="card-body">
        <div class="flashcard-progress text-muted small mb-0">כרטיס ${currentIndex + 1} מתוך ${cards.length} בסבב זה</div>
        <div class="flashcard pb-3 pt-0">
          <div class="flashcard-front">
            <h2 class="flashcard-word display-6 mt-1 mb-3">${escapeHtml(card.word)}</h2>
            ${card.context ? `<div class="flashcard-source"><span class="flashcard-source-label">משפט מתוך המסמך:</span><p class="flashcard-context text-muted fst-italic">"${escapeHtml(card.context)}"</p></div>` : ''}
          </div>
          <div class="flashcard-back ${revealed ? '' : 'hidden'} mt-4 p-3 rounded text-start">
            <p class="flashcard-definition mb-2"><strong>הגדרה:</strong> ${escapeHtml(card.definition)}</p>
            ${card.translation ? `<p class="flashcard-translation mb-0"><strong>תרגום:</strong> ${escapeHtml(card.translation)}</p>` : ''}
          </div>
        </div>
        <div class="flashcard-actions mt-4">
          ${
            !revealed
              ? '<button class="btn btn-primary btn-lg" id="revealBtn">הצג תשובה</button>'
              : `
              <p class="rate-label fw-semibold mb-3">עד כמה ידעת?</p>
              <div class="rate-buttons d-flex flex-wrap justify-content-center gap-2">
                <button class="btn rate-btn rate-0" data-q="0">שכחתי</button>
                <button class="btn rate-btn rate-2" data-q="2">קשה</button>
                <button class="btn rate-btn rate-3" data-q="3">טוב</button>
                <button class="btn rate-btn rate-4" data-q="4">קל</button>
                <button class="btn rate-btn rate-5" data-q="5">מושלם</button>
              </div>
            `
          }
        </div>
      </div>
    `;

    const revealBtn = document.getElementById('revealBtn');
    if (revealBtn) {
      revealBtn.addEventListener('click', () => {
        revealed = true;
        renderCard();
      });
    }

    // שולח דירוג איכות לשרת
    document.querySelectorAll('.rate-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const quality = parseInt(btn.dataset.q, 10);
        const rateButtons = document.querySelectorAll('.rate-btn');
        const rateLabel = document.querySelector('.rate-label');

        rateButtons.forEach((b) => {
          b.disabled = true;
          b.classList.remove('rate-btn--pending');
        });
        btn.classList.add('rate-btn--pending');
        if (rateLabel) rateLabel.textContent = 'שולח תשובה...';

        try {
          const res = await apiFetch(`/api/v1/reviews/${card.flashcard_id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ quality }),
          });
          if (isRateLimited(res)) {
            if (rateLabel) rateLabel.textContent = 'עד כמה ידעת?';
            rateButtons.forEach((b) => {
              b.disabled = false;
              b.classList.remove('rate-btn--pending');
            });
            return;
          }
          if (!res.ok) {
            throw new Error('review failed');
          }
          const data = await res.json();
          dueToday = Math.max(0, dueToday - 1);
          renderStats();
          if (rateLabel) rateLabel.textContent = 'נשלח!';
          if (data.game) showXpToast(data.game);
          currentIndex++;
          revealed = false;
          renderCard();
        } catch {
          if (rateLabel) rateLabel.textContent = 'עד כמה ידעת?';
          rateButtons.forEach((b) => {
            b.disabled = false;
            b.classList.remove('rate-btn--pending');
          });
          showStatusAlert('השליחה נכשלה. בדוק את החיבור ונסה שוב.', 'error');
        }
      });
    });
  }

  loadCards();
})();
