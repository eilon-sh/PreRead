import express from 'express';
import * as wordsController from '../controllers/words.controller.js';

const router = express.Router();

router.get('/', wordsController.list);

export default router;
