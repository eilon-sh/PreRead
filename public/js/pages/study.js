(() => {
  let cards = [];
  let currentIndex = 0;
  let revealed = false;

  const flashcardArea = document.getElementById('flashcardArea');
  const dueCount = document.getElementById('dueCount');
  const urlParams = new URLSearchParams(window.location.search);

  async function loadStats() {
    const [reviewRes, profileRes] = await Promise.all([
      apiFetch('/api/v1/reviews/stats'),
      apiFetch('/api/v1/game/profile'),
    ]);
    if (isRateLimited(reviewRes) || isRateLimited(profileRes)) return;
    const stats = await reviewRes.json();
    const profile = await profileRes.json();
    dueCount.innerHTML = `
      <strong>${stats.dueToday}</strong> כרטיסים ממתינים היום
      מתוך <strong>${stats.total}</strong> סה"כ
    `;
    document.getElementById('gameStats').innerHTML = `
      רמה <strong>${profile.stats.level}</strong> ·
      <strong>${profile.stats.xp}</strong> XP ·
      🔥 ${profile.stats.current_streak}
    `;
  }

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
      flashcardArea.innerHTML = `
        <div class="card-body flashcard-done py-5">
          <h2 class="h4">סיימת לסבב!</h2>
          <p>עברת על ${cards.length} כרטיסים בסבב זה.</p>
          <button class="btn btn-primary" onclick="location.reload()">התחל מחדש</button>
        </div>
      `;
      return;
    }

    const card = cards[currentIndex];
    flashcardArea.innerHTML = `
      <div class="card-body">
        <div class="flashcard-progress text-muted small mb-3">${currentIndex + 1} / ${cards.length}</div>
        <div class="flashcard py-3">
          <div class="flashcard-front">
            <h2 class="flashcard-word display-6 my-3">${escapeHtml(card.word)}</h2>
            ${card.context ? `<p class="flashcard-context text-muted fst-italic">"${escapeHtml(card.context)}"</p>` : ''}
          </div>
          <div class="flashcard-back ${revealed ? '' : 'hidden'} mt-4 p-3 rounded text-end">
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
                <button class="btn rate-btn rate-0" data-q="0">שוב<br><small>0</small></button>
                <button class="btn rate-btn rate-2" data-q="2">קשה<br><small>2</small></button>
                <button class="btn rate-btn rate-3" data-q="3">טוב<br><small>3</small></button>
                <button class="btn rate-btn rate-4" data-q="4">קל<br><small>4</small></button>
                <button class="btn rate-btn rate-5" data-q="5">מושלם<br><small>5</small></button>
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

    document.querySelectorAll('.rate-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const quality = parseInt(btn.dataset.q, 10);
        const res = await apiFetch(`/api/v1/reviews/${card.flashcard_id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ quality }),
        });
        const data = await res.json();
        if (data.game) showXpToast(data.game);
        currentIndex++;
        revealed = false;
        renderCard();
      });
    });
  }

  document.getElementById('reloadBtn').addEventListener('click', loadCards);
  loadCards();
})();
