'use strict';
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/ticketController');
router.get('/:id',    ctrl.getTicket);
router.get('/:id/qr', ctrl.getTicketQR);
module.exports = router;
