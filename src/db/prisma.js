import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// הגדרות הישגים ראשוניים
const ACHIEVEMENTS = [
  {
    code: 'first_upload',
    name: 'מסמך ראשון',
    description: 'העלית את המסמך הראשון שלך',
    icon: '📄',
    xpReward: 25,
    requirementType: 'documents',
    requirementValue: 1,
  },
  {
    code: 'first_review',
    name: 'חזרה ראשונה',
    description: 'סיימת את החזרה הראשונה על כרטיס',
    icon: '🎯',
    xpReward: 15,
    requirementType: 'reviews',
    requirementValue: 1,
  },
  {
    code: 'streak_3',
    name: 'רצף 3 ימים',
    description: 'למדת 3 ימים ברצף',
    icon: '🔥',
    xpReward: 50,
    requirementType: 'streak',
    requirementValue: 3,
  },
  {
    code: 'streak_7',
    name: 'שבוע של למידה',
    description: 'למדת 7 ימים ברצף',
    icon: '⚡',
    xpReward: 100,
    requirementType: 'streak',
    requirementValue: 7,
  },
  {
    code: 'streak_30',
    name: 'חודש של למידה',
    description: 'למדת 30 ימים ברצף',
    icon: '👑',
    xpReward: 500,
    requirementType: 'streak',
    requirementValue: 30,
  },
  {
    code: 'words_10',
    name: '10 מילים',
    description: 'למדת 10 מילים',
    icon: '📚',
    xpReward: 30,
    requirementType: 'mastered',
    requirementValue: 10,
  },
  {
    code: 'words_50',
    name: '50 מילים',
    description: 'למדת 50 מילים',
    icon: '📖',
    xpReward: 100,
    requirementType: 'mastered',
    requirementValue: 50,
  },
  {
    code: 'words_100',
    name: 'מאה מילים',
    description: 'למדת 100 מילים',
    icon: '🏆',
    xpReward: 250,
    requirementType: 'mastered',
    requirementValue: 100,
  },
  {
    code: 'level_5',
    name: 'רמה 5',
    description: 'הגעת לרמה 5',
    icon: '⭐',
    xpReward: 75,
    requirementType: 'level',
    requirementValue: 5,
  },
  {
    code: 'level_10',
    name: 'רמה 10',
    description: 'הגעת לרמה 10',
    icon: '🌟',
    xpReward: 200,
    requirementType: 'level',
    requirementValue: 10,
  },
  {
    code: 'perfect_5',
    name: 'רצף מושלם',
    description: '5 תשובות מושלמות ברצף',
    icon: '💎',
    xpReward: 40,
    requirementType: 'perfect_streak',
    requirementValue: 5,
  },
  {
    code: 'perfect_20',
    name: 'גאון',
    description: '20 תשובות מושלמות ברצף',
    icon: '💫',
    xpReward: 150,
    requirementType: 'perfect_streak',
    requirementValue: 20,
  },
  {
    code: 'daily_goal',
    name: 'יעד יומי',
    description: 'סיימת 20 כרטיסים ביום אחד',
    icon: '🎮',
    xpReward: 60,
    requirementType: 'daily_reviews',
    requirementValue: 20,
  },
  {
    code: 'reviews_100',
    name: 'מאה חזרות',
    description: 'ביצעת 100 חזרות',
    icon: '🔄',
    xpReward: 80,
    requirementType: 'reviews',
    requirementValue: 100,
  },
  {
    code: 'cefr_c1',
    name: 'מומחה C1',
    description: 'שלטת ב-10 מילים מרמת C1 ומעלה',
    icon: '🎓',
    xpReward: 120,
    requirementType: 'cefr_master',
    requirementValue: 10,
  },
];

// מכניס הישגים אם הטבלה ריקה
export async function seedAchievements() {
  const count = await prisma.achievement.count();
  if (count > 0) return;
  await prisma.achievement.createMany({ data: ACHIEVEMENTS });
}

export default prisma;
