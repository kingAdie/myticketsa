'use strict';
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/ticketController');
const { requireAuth } = require('../middleware/auth');

router.get('/mine',   requireAuth, ctrl.getMyTickets); // must be before /:id
router.get('/:id',    ctrl.getTicket);
router.get('/:id/qr', ctrl.getTicketQR);
module.exports = router;
