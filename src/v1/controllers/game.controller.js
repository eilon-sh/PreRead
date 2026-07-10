import { getAchievements, getUserStats } from '#services/gameService.js';

export async function getProfile(req, res) {
  const stats = await getUserStats(req.user.id);
  const achievements = await getAchievements(req.user.id);
  const unlocked = achievements.filter((a) => a.unlocked);

  res.json({
    user: { id: req.user.id, name: req.user.name, email: req.user.email },
    stats,
    achievements: {
      total: achievements.length,
      unlocked: unlocked.length,
      list: achievements,
    },
  });
}

export async function getAchievementsHandler(req, res) {
  res.json(await getAchievements(req.user.id));
}
