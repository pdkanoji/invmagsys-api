const pool = require('../config/database');
const { successResponse, errorResponse } = require('../utils/helpers');

const getAll = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const { user_id, action, module, from_date, to_date } = req.query;

    const conditions = [];
    const params = [];

    if (user_id) { params.push(user_id); conditions.push(`al.user_id = $${params.length}`); }
    if (action) { params.push(action); conditions.push(`al.action = $${params.length}`); }
    if (module) { params.push(module); conditions.push(`al.module = $${params.length}`); }
    if (from_date) { params.push(from_date); conditions.push(`al.created_at >= $${params.length}`); }
    if (to_date) { params.push(to_date + 'T23:59:59'); conditions.push(`al.created_at <= $${params.length}`); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit, offset);

    const { rows } = await pool.query(
      `SELECT al.*, u.id AS usr_id, u.first_name, u.last_name, u.email, COUNT(*) OVER() AS total_count
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       ${where}
       ORDER BY al.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const total = rows.length > 0 ? parseInt(rows[0].total_count) : 0;
    const data = rows.map(r => {
      const { total_count, usr_id, first_name, last_name, email, ...rest } = r;
      return { ...rest, user: usr_id ? { id: usr_id, first_name, last_name, email } : null };
    });

    successResponse(res, data, 'Audit logs fetched', 200, { meta: { total, page, limit } });
  } catch (err) {
    errorResponse(res, 'Failed to fetch audit logs', 500);
  }
};

module.exports = { getAll };
