const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { successResponse, errorResponse } = require('../utils/helpers');
const { authenticate } = require('../middleware/auth');
router.use(authenticate);
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM units ORDER BY name'
    );

    successResponse(res, result.rows, 'Units fetched');
  } catch (error) {
    errorResponse(res, error.message, 400);
  }
});
module.exports = router;
