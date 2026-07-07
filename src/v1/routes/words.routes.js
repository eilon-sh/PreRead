import express from 'express';
import * as wordsController from '../controllers/words.controller.js';

const router = express.Router();

router.get('/', wordsController.list);
router.get('/:id', wordsController.getById);

export default router;
