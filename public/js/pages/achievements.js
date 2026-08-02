(() => {
  // טוען ומציג את כל ההישגים
  async function loadAchievements() {
    const res = await apiFetch('/api/v1/game/achievements');
    if (isRateLimited(res)) {
      document.getElementById('achievementStats').textContent = '';
      document.getElementById('achievementList').innerHTML = rateLimitPlaceholder();
      return;
    }
    const achievements = await res.json();
    const unlocked = achievements.filter((a) => a.unlocked).length;

    document.getElementById('achievementStats').textContent =
      `פתחת ${unlocked} מתוך ${achievements.length} הישגים`;

    document.getElementById('achievementList').innerHTML = achievements
      .map(
        (a) => `
      <div class="achievement-item ${a.unlocked ? 'unlocked' : 'locked'} d-flex align-items-center flex-wrap gap-3 p-3 border rounded">
        <span class="achievement-icon fs-2">${a.unlocked ? a.icon : '🔒'}</span>
        <div class="achievement-info flex-grow-1">
          <strong class="d-block">${escapeHtml(a.name)}</strong>
          <span class="text-muted small">${escapeHtml(a.description)}</span>
          <span class="achievement-reward d-block small">+${a.xp_reward} XP</span>
        </div>
        ${a.unlocked ? `<span class="achievement-date small text-muted">${a.unlocked_at?.slice(0, 10) || ''}</span>` : ''}
      </div>
    `,
      )
      .join('');
  }

  loadAchievements();
})();
