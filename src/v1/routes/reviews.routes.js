import express from 'express';
import * as reviewsController from '../controllers/reviews.controller.js';

const router = express.Router();

router.get('/due', reviewsController.getDue);
router.get('/stats', reviewsController.getStatsHandler);
// ניתן לשלוח גם כאשר הכרטיס לא נמצא ברשימת "הממתינים" ללמידה יומית
// לא נוסיף לזה בדיקה כי מבחינתו זה בסדר
router.post('/:id', reviewsController.submitReview);

export default router;
