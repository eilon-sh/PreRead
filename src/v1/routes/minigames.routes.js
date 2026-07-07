import express from 'express';
import * as minigamesController from '../controllers/minigames.controller.js';

const router = express.Router();

router.get('/words', minigamesController.getWords);
router.post('/complete', minigamesController.complete);

export default router;
