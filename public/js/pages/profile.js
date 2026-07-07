(() => {
  async function loadProfile() {
    const res = await apiFetch('/api/v1/game/profile');
    if (isRateLimited(res)) {
      document.getElementById('profileContent').innerHTML = rateLimitPlaceholder();
      return;
    }
    const data = await res.json();
    const s = data.stats;
    const recentAchievements = data.achievements.list.filter((a) => a.unlocked).slice(0, 5);

    document.getElementById('profileContent').innerHTML = `
      <section class="card profile-header text-center">
        <div class="card-body py-4">
          <div class="level-badge d-inline-block mb-3">רמה ${s.level}</div>
          <h2 class="h4 mb-3">${escapeHtml(data.user.name || data.user.email)}</h2>
          <div class="xp-bar-wrap mx-auto" style="max-width:400px">
            <div class="xp-bar" style="width: ${s.progressPercent}%"></div>
          </div>
          <p class="xp-text text-muted mt-3 mb-0">${s.xp} XP · ${s.progressXp}/${s.neededXp} לרמה הבאה</p>
        </div>
      </section>

      <section class="card">
        <div class="card-body">
          <div class="row g-2 stats-grid text-center">
            <div class="col-6 col-md-4"><div class="stat-item p-3 rounded h-100"><span class="stat-value d-block">${s.current_streak}</span><span class="stat-label small text-muted">🔥 רצף יומי</span></div></div>
            <div class="col-6 col-md-4"><div class="stat-item p-3 rounded h-100"><span class="stat-value d-block">${s.longest_streak}</span><span class="stat-label small text-muted">🏅 רצף שיא</span></div></div>
            <div class="col-6 col-md-4"><div class="stat-item p-3 rounded h-100"><span class="stat-value d-block">${s.total_reviews}</span><span class="stat-label small text-muted">🔄 חזרות</span></div></div>
            <div class="col-6 col-md-4"><div class="stat-item p-3 rounded h-100"><span class="stat-value d-block">${s.mastered_words}</span><span class="stat-label small text-muted">📚 מילים שלוטות</span></div></div>
            <div class="col-6 col-md-4"><div class="stat-item p-3 rounded h-100"><span class="stat-value d-block">${data.achievements.unlocked}</span><span class="stat-label small text-muted">🏆 הישגים</span></div></div>
            <div class="col-6 col-md-4"><div class="stat-item p-3 rounded h-100"><span class="stat-value d-block">${s.daily_reviews_today}</span><span class="stat-label small text-muted">🎯 היום</span></div></div>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card-body">
          <h2 class="h5 mb-3">הישגים אחרונים</h2>
          ${
            recentAchievements.length === 0
              ? '<p class="text-muted mb-0">עדיין אין הישגים. <a href="/study">התחל ללמוד!</a></p>'
              : `<div class="achievement-list d-flex flex-column gap-2">${recentAchievements
                  .map(
                    (a) => `
                <div class="achievement-item unlocked d-flex align-items-center gap-3 p-3 border rounded">
                  <span class="achievement-icon fs-2">${a.icon}</span>
                  <div><strong>${escapeHtml(a.name)}</strong><br><span class="text-muted small">${escapeHtml(a.description)}</span></div>
                </div>
              `,
                  )
                  .join('')}</div>`
          }
          <a href="/achievements" class="btn btn-secondary mt-3">כל ההישגים</a>
        </div>
      </section>
    `;
  }

  loadProfile();
})();
