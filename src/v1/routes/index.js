import express from 'express';
import { createCsrfToken } from '#middleware/security.js';
import documentsRoutes from './documents.routes.js';
import gameRoutes from './game.routes.js';
import minigamesRoutes from './minigames.routes.js';
import reviewsRoutes from './reviews.routes.js';
import wordsRoutes from './words.routes.js';

const router = express.Router();

router.get('/csrf-token', (req, res) => {
  res.json({ csrfToken: createCsrfToken(req, res) });
});

router.use('/documents', documentsRoutes);
router.use('/words', wordsRoutes);
router.use('/reviews', reviewsRoutes);
router.use('/game', gameRoutes);
router.use('/minigames', minigamesRoutes);

export default router;
