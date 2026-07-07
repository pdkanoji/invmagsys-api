const pool = require('../config/database');
const { successResponse, errorResponse, buildPaginationQuery, buildSortQuery, generateUniqueCode } = require('../utils/helpers');

const getAll = async (req, res) => {
  try {
    const { page, limit, offset } = buildPaginationQuery(req.query);
    const { sortBy, ascending } = buildSortQuery(req.query, 'return_date');
    const { search, status, customer_id, from_date, to_date } = req.query;

    const conditions = ['sr.deleted_at IS NULL'];
    const params = [];

    if (search) { params.push(`%${search}%`); conditions.push(`sr.return_number ILIKE $${params.length}`); }
    if (status) { params.push(status); conditions.push(`sr.status = $${params.length}`); }
    if (customer_id) { params.push(customer_id); conditions.push(`sr.customer_id = $${params.length}`); }
    if (from_date) { params.push(from_date); conditions.push(`sr.return_date >= $${params.length}`); }
    if (to_date) { params.push(to_date); conditions.push(`sr.return_date <= $${params.length}`); }
    params.push(req.user.role_name.includes('admin') ? req.user.id : req.user.admin_id);
    conditions.push(`sr.created_by = $${params.length}`);
    params.push(limit, offset);
    const { rows } = await pool.query(
      `SELECT sr.*, c.name AS cust_name, w.name AS wh_name,
              s.sale_number, COUNT(*) OVER() AS total_count
       FROM sale_returns sr
       LEFT JOIN customers c ON c.id = sr.customer_id
       LEFT JOIN warehouses w ON w.id = sr.warehouse_id
       LEFT JOIN sales s ON s.id = sr.sale_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY sr.${sortBy} ${ascending ? 'ASC' : 'DESC'}
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const total = rows.length > 0 ? parseInt(rows[0].total_count) : 0;
    const data = rows.map(({ total_count, cust_name, wh_name, sale_number, ...r }) => ({
      ...r,
      customer: cust_name ? { name: cust_name } : null,
      warehouse: wh_name ? { name: wh_name } : null,
      sale: sale_number ? { sale_number } : null,
    }));

    successResponse(res, data, 'Sale returns fetched', 200, { meta: { total, page, limit, totalPages: Math.ceil(total / limit) } });
  } catch (err) {
    errorResponse(res, 'Failed to fetch sale returns', 500);
  }
};

const getById = async (req, res) => {
  try {
    const { rows: srRows } = await pool.query(
      `SELECT sr.*, row_to_json(c.*) AS customer, json_build_object('id', w.id, 'name', w.name) AS warehouse,
              json_build_object('id', s.id, 'sale_number', s.sale_number) AS sale
       FROM sale_returns sr
       LEFT JOIN customers c ON c.id = sr.customer_id
       LEFT JOIN warehouses w ON w.id = sr.warehouse_id
       LEFT JOIN sales s ON s.id = sr.sale_id
       WHERE sr.id = $1 AND sr.deleted_at IS NULL`,
      [req.params.id]
    );
    if (!srRows[0]) return errorResponse(res, 'Sale return not found', 404);

    const { rows: items } = await pool.query(
      `SELECT sri.*, json_build_object('id', prod.id, 'name', prod.name, 'code', prod.code,
               'unit', json_build_object('abbreviation', u.abbreviation)) AS product
       FROM sale_return_items sri
       LEFT JOIN products prod ON prod.id = sri.product_id
       LEFT JOIN units u ON u.id = prod.unit_id
       WHERE sri.return_id = $1`,
      [req.params.id]
    );

    successResponse(res, { ...srRows[0], return_items: items });
  } catch (err) {
    errorResponse(res, 'Failed to fetch sale return', 500);
  }
};

const create = async (req, res) => {
  try {
    const { sale_id, return_date, items, reason, notes } = req.body;

    const { rows: sRows } = await pool.query(
      'SELECT id, customer_id, warehouse_id FROM sales WHERE id = $1 AND deleted_at IS NULL',
      [sale_id]
    );
    if (!sRows[0]) return errorResponse(res, 'Sale not found', 404);
    const sale = sRows[0];

    const return_number = generateUniqueCode('SRN');
    let subtotal = 0, tax_amount = 0;
    const returnItems = items.map(item => {
      const taxAmt = (item.unit_price * item.quantity * (item.tax_percentage || 0)) / 100;
      const total = item.unit_price * item.quantity + taxAmt;
      subtotal += item.unit_price * item.quantity;
      tax_amount += taxAmt;
      return { ...item, tax_amount: taxAmt, total_price: total };
    });
    const total_amount = subtotal + tax_amount;

    const { rows } = await pool.query(
      `INSERT INTO sale_returns (return_number, sale_id, customer_id, warehouse_id, return_date, reason, subtotal, tax_amount, total_amount, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [return_number, sale_id, sale.customer_id, sale.warehouse_id, return_date, reason || null, subtotal, tax_amount, total_amount, notes || null,  req.user.role_name.includes('admin') ? req.user.id : req.user.admin_id]
    );
    const ret = rows[0];

    for (const item of returnItems) {
      await pool.query(
        'INSERT INTO sale_return_items (return_id, product_id, quantity, unit_price, tax_percentage, tax_amount, total_price) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [ret.id, item.product_id, item.quantity, item.unit_price, item.tax_percentage || 0, item.tax_amount, item.total_price]
      );
    }

    successResponse(res, ret, 'Sale return created', 201);
  } catch (err) {
    errorResponse(res, 'Failed to create sale return', 500);
  }
};

const updateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['pending', 'approved', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) return errorResponse(res, 'Invalid status', 400);

    const { rows } = await pool.query(
      'UPDATE sale_returns SET status=$1, updated_at=NOW() WHERE id=$2 AND deleted_at IS NULL RETURNING *',
      [status, req.params.id]
    );
    if (!rows[0]) return errorResponse(res, 'Sale return not found', 404);

    if (status === 'completed') {
      const { rows: items } = await pool.query('SELECT * FROM sale_return_items WHERE return_id = $1', [rows[0].id]);
      for (const item of items) {
        const { rows: invRows } = await pool.query(
          'SELECT id, current_stock FROM inventory WHERE product_id = $1 AND warehouse_id = $2',
          [item.product_id, rows[0].warehouse_id]
        );
        if (invRows[0]) {
          await pool.query('UPDATE inventory SET current_stock = current_stock + $1 WHERE id = $2', [item.quantity, invRows[0].id]);
        } else {
          await pool.query('INSERT INTO inventory (product_id, warehouse_id, current_stock) VALUES ($1,$2,$3)', [item.product_id, rows[0].warehouse_id, item.quantity]);
        }
        await pool.query(
          'INSERT INTO inventory_transactions (product_id, warehouse_id, transaction_type, quantity, reference_type, reference_id, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7)',
          [item.product_id, rows[0].warehouse_id, 'sale_return', item.quantity, 'sale_return', rows[0].id,  req.user.role_name.includes('admin') ? req.user.id : req.user.admin_id]
        );
      }
    }

    successResponse(res, rows[0], 'Status updated');
  } catch (err) {
    errorResponse(res, 'Failed to update status', 500);
  }
};

const remove = async (req, res) => {
  try {
    const { rows } = await pool.query(
      'UPDATE sale_returns SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id',
      [req.params.id]
    );
    if (!rows[0]) return errorResponse(res, 'Sale return not found', 404);
    successResponse(res, null, 'Sale return deleted');
  } catch (err) {
    errorResponse(res, 'Failed to delete sale return', 500);
  }
};

module.exports = { getAll, getById, create, updateStatus, remove };
