'use strict';
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/paymentController');
router.post('/notify',       ctrl.handleNotify);
router.post('/simulate',     ctrl.simulatePayment);
router.get('/status/:ref',   ctrl.getPaymentStatus);
module.exports = router;
