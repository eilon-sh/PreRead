// נתיבי מילים ממסמכים
import express from 'express';
import * as wordsController from '../controllers/words.controller.js';

const router = express.Router();

// מחזיר רשימת מילים למשתמש
router.get('/', wordsController.list);

export default router;
