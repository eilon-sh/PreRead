import prisma from '#db/prisma.js';
import { today } from '#utils/dateUtils.js';
import { computeStreakUpdate } from '#utils/streakUtils.js';
import { checkAchievements, ensureUserStats, getUserStats, levelFromXp } from './gameService.js';

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function getGameWords(userId, { cefr, documentId, limit = 20 } = {}) {
  const take = Math.min(Math.max(limit * 5, limit), 200);
  const words = await prisma.word.findMany({
    where: {
      document: {
        userId,
        ...(documentId ? { id: documentId } : {}),
      },
      ...(cefr ? { cefr: cefr.toUpperCase() } : {}),
    },
    select: {
      id: true,
      word: true,
      definition: true,
      translation: true,
      context: true,
      cefr: true,
    },
    take,
  });

  return shuffle(words).slice(0, Math.min(limit, words.length));
}

export async function awardMinigameXp(userId, { correct, total, gameType }) {
  if (total <= 0) {
    return { xpGained: 0, leveledUp: false, newAchievements: [] };
  }

  const todayStr = today();
  const stats = await ensureUserStats(userId);

  let xpGained = correct * 5;
  if (correct === total) xpGained += 15;
  if (correct >= Math.ceil(total * 0.8)) xpGained += 5;

  const { currentStreak, longestStreak } = computeStreakUpdate(stats, todayStr);

  const newXp = stats.xp + xpGained;
  const newLevel = levelFromXp(newXp);
  const leveledUp = newLevel > stats.level;

  await prisma.userStats.update({
    where: { userId },
    data: {
      xp: newXp,
      level: newLevel,
      currentStreak,
      longestStreak,
      lastStudyDate: todayStr,
    },
  });

  const newAchievements = await checkAchievements(userId, await getUserStats(userId));

  return {
    xpGained,
    totalXp: newXp,
    level: newLevel,
    leveledUp,
    newAchievements: newAchievements.map((a) => ({
      name: a.name,
      icon: a.icon,
    })),
    gameType,
  };
}
