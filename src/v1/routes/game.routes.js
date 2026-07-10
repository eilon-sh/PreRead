import express from 'express';
import * as gameController from '../controllers/game.controller.js';

const router = express.Router();

router.get('/profile', gameController.getProfile);
router.get('/achievements', gameController.getAchievementsHandler);

export default router;
