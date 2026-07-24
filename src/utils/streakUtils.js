/**
 * Compute streak fields after a study day.
 * Same calendar day → unchanged. Consecutive day → increment. Gap or first day → reset to 1.
 *
 * @param {{ lastStudyDate: string | null, currentStreak: number, longestStreak: number }} stats
 * @param {string} todayStr ISO date YYYY-MM-DD
 * @returns {{ currentStreak: number, longestStreak: number }}
 */
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
