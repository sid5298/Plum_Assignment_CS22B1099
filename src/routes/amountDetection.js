const express = require('express');
const router = express.Router();
const upload = require('../middlewares/upload');
const amountDetectionController = require('../controllers/amountDetectionController');

router.post('/detect-amounts', upload.single('image'), amountDetectionController.detectAmounts);

module.exports = router;
