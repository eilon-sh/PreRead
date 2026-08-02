import express from 'express';
import * as gameController from '../controllers/game.controller.js';

const router = express.Router();

// מחזיר פרופיל שחקן וסטטיסטיקה
router.get('/profile', gameController.getProfile);
// מחזיר רשימת הישגים
router.get('/achievements', gameController.getAchievementsHandler);

export default router;
