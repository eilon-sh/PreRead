import assert from 'node:assert/strict';
import { addDays, calendarDate } from '../src/utils/dateUtils.js';
import { computeStreakUpdate } from '../src/utils/streakUtils.js';
assert.equal(calendarDate(new Date(2026, 7, 25, 0, 30, 0)), '2026-08-25');
assert.equal(calendarDate(new Date(2026, 7, 25, 23, 30, 0)), '2026-08-25');

assert.equal(addDays('2026-08-25', 1), '2026-08-26');
assert.equal(addDays('2026-08-25', -1), '2026-08-24');
assert.equal(addDays('2026-12-31', 1), '2027-01-01');
assert.equal(addDays('2026-03-01', -1), '2026-02-28');

const consecutive = computeStreakUpdate(
  { lastStudyDate: '2026-08-24', currentStreak: 3, longestStreak: 5 },
  '2026-08-25',
);
assert.equal(consecutive.currentStreak, 4);
assert.equal(consecutive.longestStreak, 5);

const gap = computeStreakUpdate(
  { lastStudyDate: '2026-08-23', currentStreak: 3, longestStreak: 5 },
  '2026-08-25',
);
assert.equal(gap.currentStreak, 1);

const sameDay = computeStreakUpdate(
  { lastStudyDate: '2026-08-25', currentStreak: 4, longestStreak: 5 },
  '2026-08-25',
);
assert.equal(sameDay.currentStreak, 4);

console.log('dateUtils tests passed');
