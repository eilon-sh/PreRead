import path from 'node:path';
import express from 'express';
import multer from 'multer';
import config from '#config.js';
import { extractLimiter, uploadLimiter } from '#middleware/security.js';
import * as documentsController from '../controllers/documents.controller.js';

const router = express.Router();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.uploadsDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
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
router.post('/', uploadLimiter, extractLimiter, upload.single('pdf'), documentsController.upload);
router.delete('/:id', documentsController.remove);

export default router;
