const pool = require('../config/database');
const { successResponse, errorResponse, buildPaginationQuery } = require('../utils/helpers');

const getAll = async (req, res) => {
  try {
    const { page, limit, offset } = buildPaginationQuery(req.query);
    const conditions = [];
    const params = [];

    if (req.query.is_read !== undefined) {
      params.push(req.query.is_read === 'true');
      conditions.push(`is_read = $${params.length}`);
    }
    if (req.query.type) {
      params.push(req.query.type);
      conditions.push(`type = $${params.length}`);
    }
    if (req.user?.id) {
      params.push(req.user.id);
      conditions.push(`(user_id = $${params.length} OR user_id IS NULL)`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit, offset);

    const { rows } = await pool.query(
      `SELECT *, COUNT(*) OVER() AS total_count FROM notifications ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const total = rows.length > 0 ? parseInt(rows[0].total_count) : 0;
    const data = rows.map(({ total_count, ...r }) => r);
    successResponse(res, data, 'Notifications fetched', 200, { meta: { total, page, limit } });
  } catch (err) {
    errorResponse(res, 'Failed to fetch notifications', 500);
  }
};

const markRead = async (req, res) => {
  try {
    const { rows } = await pool.query('UPDATE notifications SET is_read = true WHERE id = $1 RETURNING *', [req.params.id]);
    if (!rows[0]) return errorResponse(res, 'Notification not found', 404);
    successResponse(res, rows[0], 'Notification marked as read');
  } catch (err) {
    errorResponse(res, 'Failed to update notification', 500);
  }
};

const markAllRead = async (req, res) => {
  try {
    await pool.query('UPDATE notifications SET is_read = true WHERE is_read = false');
    successResponse(res, null, 'All notifications marked as read');
  } catch (err) {
    errorResponse(res, 'Failed to update notifications', 500);
  }
};

const checkLowStock = async (req, res) => {
  try {
    const { rows: inventoryItems } = await pool.query(
      'SELECT i.available_stock, i.product_id, p.name AS product_name, p.reorder_level FROM inventory i LEFT JOIN products p ON p.id = i.product_id'
    );

    const notifications = [];
    for (const item of inventoryItems) {
      const reorderLevel = item.reorder_level || 0;
      if (item.available_stock <= 0) {
        notifications.push(['out_of_stock', 'Out of Stock Alert', `${item.product_name} is out of stock`, 'product', item.product_id]);
      } else if (item.available_stock <= reorderLevel) {
        notifications.push(['low_stock', 'Low Stock Alert', `${item.product_name} is running low (${item.available_stock} remaining)`, 'product', item.product_id]);
      }
    }

    for (const n of notifications) {
      await pool.query(
        'INSERT INTO notifications (type, title, message, reference_type, reference_id) VALUES ($1,$2,$3,$4,$5)',
        n
      );
    }

    successResponse(res, { generated: notifications.length }, `${notifications.length} stock alerts generated`);
  } catch (err) {
    errorResponse(res, 'Failed to check stock levels', 500);
  }
};

module.exports = { getAll, markRead, markAllRead, checkLowStock };
