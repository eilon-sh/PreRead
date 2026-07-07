import express from 'express';
import * as reviewsController from '../controllers/reviews.controller.js';

const router = express.Router();

router.get('/due', reviewsController.getDue);
router.get('/stats', reviewsController.getStatsHandler);
router.post('/:id', reviewsController.submitReview);

export default router;
