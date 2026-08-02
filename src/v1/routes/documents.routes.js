import express from 'express';
import multer from 'multer';
import { uploadLimiter } from '#middleware/security.js';
import * as documentsController from '../controllers/documents.controller.js';

const router = express.Router();

// מגדיר העלאת PDF לזיכרון
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  // שומר שמות קבצים ב-UTF-8
  defParamCharset: 'utf8',
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  },
});

router.get('/', documentsController.list);
router.get('/:id', documentsController.getById);
router.post('/', uploadLimiter, upload.single('pdf'), documentsController.upload);
router.delete('/:id', documentsController.remove);

export default router;
