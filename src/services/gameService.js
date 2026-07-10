import prisma from '#db/prisma.js';
import { today } from '#utils/dateUtils.js';
import { computeStreakUpdate } from '#utils/streakUtils.js';

const XP_BY_QUALITY = { 0: 2, 1: 3, 2: 5, 3: 10, 4: 15, 5: 25 };

export function xpForLevel(level) {
  return (level - 1) * (level - 1) * 50;
}

export function levelFromXp(xp) {
  if (xp <= 0) return 1;
  return Math.floor(Math.sqrt(xp / 50)) + 1;
}

function toStatsResponse(stats) {
  const currentLevelXp = xpForLevel(stats.level);
  const nextLevelXp = xpForLevel(stats.level + 1);
  const progressXp = stats.xp - currentLevelXp;
  const neededXp = nextLevelXp - currentLevelXp;

  return {
    user_id: stats.userId,
    xp: stats.xp,
    level: stats.level,
    current_streak: stats.currentStreak,
    longest_streak: stats.longestStreak,
    last_study_date: stats.lastStudyDate,
    total_reviews: stats.totalReviews,
    mastered_words: stats.masteredWords,
    perfect_streak: stats.perfectStreak,
    daily_reviews_today: stats.dailyReviewsToday,
    daily_reviews_date: stats.dailyReviewsDate,
    progressXp,
    neededXp,
    progressPercent: neededXp > 0 ? Math.round((progressXp / neededXp) * 100) : 100,
    nextLevelXp,
  };
}

export async function ensureUserStats(userId, tx = prisma) {
  return tx.userStats.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
}

export async function getUserStats(userId) {
  const stats = await ensureUserStats(userId);
  return toStatsResponse(stats);
}

async function unlockAchievement(userId, achievementId, tx = prisma) {
  const existing = await tx.userAchievement.findUnique({
    where: { userId_achievementId: { userId, achievementId } },
  });
  if (existing) return null;

  const achievement = await tx.achievement.findUnique({
    where: { id: achievementId },
  });
  await tx.userAchievement.create({ data: { userId, achievementId } });

  if (achievement.xpReward > 0) {
    const current = await tx.userStats.findUnique({ where: { userId } });
    const newXp = current.xp + achievement.xpReward;
    await tx.userStats.update({
      where: { userId },
      data: { xp: newXp, level: levelFromXp(newXp) },
    });
  }
  return achievement;
}

export async function checkAchievements(userId, stats, tx = prisma) {
  const unlocked = [];
  const all = await tx.achievement.findMany();
  const userUnlocked = new Set(
    (
      await tx.userAchievement.findMany({
        where: { userId },
        select: { achievementId: true },
      })
    ).map((r) => r.achievementId),
  );

  const docCount = await tx.document.count({ where: { userId } });
  const cefrMaster = await tx.flashcard.count({
    where: {
      repetitions: { gte: 3 },
      word: {
        cefr: { in: ['C1', 'C2'] },
        document: { userId },
      },
    },
  });

  const metrics = {
    documents: docCount,
    reviews: stats.total_reviews,
    streak: stats.longest_streak,
    mastered: stats.mastered_words,
    level: stats.level,
    perfect_streak: stats.perfect_streak,
    daily_reviews: stats.daily_reviews_today,
    cefr_master: cefrMaster,
  };

  for (const ach of all) {
    if (userUnlocked.has(ach.id)) continue;
    const value = metrics[ach.requirementType] ?? 0;
    if (value >= ach.requirementValue) {
      const result = await unlockAchievement(userId, ach.id, tx);
      if (result) unlocked.push(result);
    }
  }
  return unlocked;
}

export async function processReview(userId, quality, card, tx = prisma) {
  const todayStr = today();
  const xpGained = XP_BY_QUALITY[quality] ?? 5;
  const stats = await ensureUserStats(userId, tx);

  const { currentStreak, longestStreak } = computeStreakUpdate(stats, todayStr);
  const dailyReviews = stats.dailyReviewsDate === todayStr ? stats.dailyReviewsToday + 1 : 1;
  const perfectStreak = quality === 5 ? stats.perfectStreak + 1 : 0;

  let masteredWords = stats.masteredWords;
  const wasMastered = card.repetitions >= 3;
  const updatedReps = quality >= 3 ? card.repetitions + 1 : 0;
  if (!wasMastered && updatedReps >= 3) {
    masteredWords += 1;
  }

  const newXp = stats.xp + xpGained;
  const newLevel = levelFromXp(newXp);

  const updatedStats = await tx.userStats.update({
    where: { userId },
    data: {
      xp: newXp,
      level: newLevel,
      currentStreak,
      longestStreak,
      lastStudyDate: todayStr,
      totalReviews: { increment: 1 },
      masteredWords,
      perfectStreak,
      dailyReviewsToday: dailyReviews,
      dailyReviewsDate: todayStr,
    },
  });

  const statsForAchievements = toStatsResponse(updatedStats);
  const newAchievements = await checkAchievements(userId, statsForAchievements, tx);
  const leveledUp = newLevel > stats.level;

  return {
    xpGained,
    totalXp: newXp,
    level: newLevel,
    leveledUp,
    currentStreak,
    newAchievements,
  };
}

export async function getAchievements(userId) {
  await ensureUserStats(userId);

  const achievements = await prisma.achievement.findMany({
    include: {
      userAchievements: { where: { userId }, take: 1 },
    },
    orderBy: { id: 'asc' },
  });

  return achievements
    .map((a) => ({
      id: a.id,
      code: a.code,
      name: a.name,
      description: a.description,
      icon: a.icon,
      xp_reward: a.xpReward,
      requirement_type: a.requirementType,
      requirement_value: a.requirementValue,
      unlocked: a.userAchievements.length > 0 ? 1 : 0,
      unlocked_at: a.userAchievements[0]?.unlockedAt?.toISOString() ?? null,
    }))
    .sort((a, b) => b.unlocked - a.unlocked || a.id - b.id);
}
