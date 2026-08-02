// נתיבי מיני-משחקים ו-XP
import express from 'express';
import * as minigamesController from '../controllers/minigames.controller.js';

const router = express.Router();

// מילים למשחק התאמה או חידון
router.get('/words', minigamesController.getWords);
// התשובה נשלחת דרך צד הלקוח
// ולא מאומתת בצד השרת (XP farming)
// לא מפריע לנו שאפשר לנצל את זה
router.post('/complete', minigamesController.complete);

export default router;
