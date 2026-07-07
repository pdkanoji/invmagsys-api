const pool = require('../config/database');
const { successResponse, errorResponse } = require('../utils/helpers');

const recordPayment = async (req, res) => {
  try {
    const { amount, payment_method, payment_date, reference_number, notes } = req.body;
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return errorResponse(res, 'Valid payment amount is required', 400);
    }

    const { rows: pRows } = await pool.query(
      'SELECT id, total_amount, paid_amount FROM purchases WHERE id = $1 AND deleted_at IS NULL',
      [req.params.id]
    );
    if (!pRows[0]) return errorResponse(res, 'Purchase not found', 404);

    const purchase = pRows[0];
    const newPaid = parseFloat(purchase.paid_amount || 0) + parseFloat(amount);
    const total = parseFloat(purchase.total_amount);
    const paymentStatus = newPaid >= total ? 'paid' : newPaid > 0 ? 'partial' : 'unpaid';
    const pDate = payment_date || new Date().toISOString().split('T')[0];

    await pool.query(
      'INSERT INTO purchase_payments (purchase_id, amount, payment_method, payment_date, reference_number, notes, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [purchase.id, amount, payment_method || 'cash', pDate, reference_number || null, notes || null,  req.user.role_name.includes('admin') ? req.user.id : req.user.admin_id]
    );

    const { rows: updated } = await pool.query(
      'UPDATE purchases SET paid_amount=$1, payment_status=$2, payment_method=$3, payment_date=$4, payment_notes=$5 WHERE id=$6 RETURNING *',
      [newPaid, paymentStatus, payment_method || 'cash', pDate, notes || null, purchase.id]
    );

    successResponse(res, updated[0], 'Payment recorded');
  } catch (err) {
    errorResponse(res, 'Failed to record payment', 500);
  }
};

const getPaymentHistory = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT pp.id, pp.amount, pp.payment_method, pp.payment_date, pp.reference_number, pp.notes, pp.created_at,
              u.first_name, u.last_name
       FROM purchase_payments pp
       LEFT JOIN users u ON u.id = pp.created_by
       WHERE pp.purchase_id = $1
       ORDER BY pp.created_at DESC`,
      [req.params.id]
    );

    const data = rows.map(({ first_name, last_name, ...r }) => ({
      ...r,
      created_by_user: first_name ? { first_name, last_name } : null,
    }));

    successResponse(res, data, 'Payment history fetched');
  } catch (err) {
    errorResponse(res, 'Failed to fetch payment history', 500);
  }
};

module.exports = { recordPayment, getPaymentHistory };
