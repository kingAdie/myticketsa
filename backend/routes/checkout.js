'use strict';
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/checkoutController');
router.post('/', ctrl.processCheckout);
module.exports = router;
