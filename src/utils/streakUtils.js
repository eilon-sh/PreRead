export function computeStreakUpdate(stats, todayStr) {
  if (stats.lastStudyDate === todayStr) {
    return {
      currentStreak: stats.currentStreak,
      longestStreak: stats.longestStreak,
    };
  }

  let currentStreak;
  if (stats.lastStudyDate) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);
    currentStreak = stats.lastStudyDate === yesterdayStr ? stats.currentStreak + 1 : 1;
  } else {
    currentStreak = 1;
  }

  return {
    currentStreak,
    longestStreak: Math.max(stats.longestStreak, currentStreak),
  };
}
