'use strict';

require('dotenv').config();

const serverless = require('serverless-http');
const { app, initDb } = require('../../server');

let initialized = false;
const baseHandler = serverless(app);

module.exports.handler = async (event, context) => {
  // Run DB init once per container cold start (idempotent safe to re-run)
  if (!initialized) {
    await initDb();
    initialized = true;
  }
  return baseHandler(event, context);
};
