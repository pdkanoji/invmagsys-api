const pool = require('../config/database');
const { successResponse, errorResponse, buildPaginationQuery, buildSortQuery, generateUniqueCode } = require('../utils/helpers');

const getAll = async (req, res) => {
  try {
    const { page, limit, offset } = buildPaginationQuery(req.query);
    const { sortBy, ascending } = buildSortQuery(req.query, 'return_date');
    const { search, status, supplier_id, from_date, to_date } = req.query;

    const conditions = ['pr.deleted_at IS NULL'];
    const params = [];

    if (search) { params.push(`%${search}%`); conditions.push(`pr.return_number ILIKE $${params.length}`); }
    if (status) { params.push(status); conditions.push(`pr.status = $${params.length}`); }
    if (supplier_id) { params.push(supplier_id); conditions.push(`pr.supplier_id = $${params.length}`); }
    if (from_date) { params.push(from_date); conditions.push(`pr.return_date >= $${params.length}`); }
    if (to_date) { params.push(to_date); conditions.push(`pr.return_date <= $${params.length}`); }

    params.push(limit, offset);
    const { rows } = await pool.query(
      `SELECT pr.*, s.name AS sup_name, w.name AS wh_name,
              p.purchase_number, COUNT(*) OVER() AS total_count
       FROM purchase_returns pr
       LEFT JOIN suppliers s ON s.id = pr.supplier_id
       LEFT JOIN warehouses w ON w.id = pr.warehouse_id
       LEFT JOIN purchases p ON p.id = pr.purchase_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY pr.${sortBy} ${ascending ? 'ASC' : 'DESC'}
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const total = rows.length > 0 ? parseInt(rows[0].total_count) : 0;
    const data = rows.map(({ total_count, sup_name, wh_name, purchase_number, ...r }) => ({
      ...r,
      supplier: sup_name ? { name: sup_name } : null,
      warehouse: wh_name ? { name: wh_name } : null,
      purchase: purchase_number ? { purchase_number } : null,
    }));

    successResponse(res, data, 'Purchase returns fetched', 200, { meta: { total, page, limit, totalPages: Math.ceil(total / limit) } });
  } catch (err) {
    errorResponse(res, 'Failed to fetch purchase returns', 500);
  }
};

const getById = async (req, res) => {
  try {
    const { rows: prRows } = await pool.query(
      `SELECT pr.*, row_to_json(s.*) AS supplier, json_build_object('id', w.id, 'name', w.name) AS warehouse,
              json_build_object('id', p.id, 'purchase_number', p.purchase_number) AS purchase
       FROM purchase_returns pr
       LEFT JOIN suppliers s ON s.id = pr.supplier_id
       LEFT JOIN warehouses w ON w.id = pr.warehouse_id
       LEFT JOIN purchases p ON p.id = pr.purchase_id
       WHERE pr.id = $1 AND pr.deleted_at IS NULL`,
      [req.params.id]
    );
    if (!prRows[0]) return errorResponse(res, 'Purchase return not found', 404);

    const { rows: items } = await pool.query(
      `SELECT pri.*, json_build_object('id', prod.id, 'name', prod.name, 'code', prod.code,
               'unit', json_build_object('abbreviation', u.abbreviation)) AS product
       FROM purchase_return_items pri
       LEFT JOIN products prod ON prod.id = pri.product_id
       LEFT JOIN units u ON u.id = prod.unit_id
       WHERE pri.return_id = $1`,
      [req.params.id]
    );

    successResponse(res, { ...prRows[0], return_items: items });
  } catch (err) {
    errorResponse(res, 'Failed to fetch purchase return', 500);
  }
};

const create = async (req, res) => {
  try {
    const { purchase_id, return_date, items, reason, notes } = req.body;

    const { rows: pRows } = await pool.query(
      'SELECT id, supplier_id, warehouse_id FROM purchases WHERE id = $1 AND deleted_at IS NULL',
      [purchase_id]
    );
    if (!pRows[0]) return errorResponse(res, 'Purchase not found', 404);
    const purchase = pRows[0];

    const return_number = generateUniqueCode('PRN');
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
      `INSERT INTO purchase_returns (return_number, purchase_id, supplier_id, warehouse_id, return_date, reason, subtotal, tax_amount, total_amount, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [return_number, purchase_id, purchase.supplier_id, purchase.warehouse_id, return_date, reason || null, subtotal, tax_amount, total_amount, notes || null,  req.user.role_name.includes('admin') ? req.user.id : req.user.admin_id]
    );
    const ret = rows[0];

    for (const item of returnItems) {
      await pool.query(
        'INSERT INTO purchase_return_items (return_id, product_id, quantity, unit_price, tax_percentage, tax_amount, total_price) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [ret.id, item.product_id, item.quantity, item.unit_price, item.tax_percentage || 0, item.tax_amount, item.total_price]
      );
    }

    successResponse(res, ret, 'Purchase return created', 201);
  } catch (err) {
    errorResponse(res, 'Failed to create purchase return', 500);
  }
};

const updateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['pending', 'approved', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) return errorResponse(res, 'Invalid status', 400);

    const { rows } = await pool.query(
      'UPDATE purchase_returns SET status=$1, updated_at=NOW() WHERE id=$2 AND deleted_at IS NULL RETURNING *',
      [status, req.params.id]
    );
    if (!rows[0]) return errorResponse(res, 'Purchase return not found', 404);

    if (status === 'completed') {
      const { rows: items } = await pool.query('SELECT * FROM purchase_return_items WHERE return_id = $1', [rows[0].id]);
      for (const item of items) {
        await pool.query(
          'UPDATE inventory SET current_stock = current_stock - $1 WHERE product_id = $2 AND warehouse_id = $3',
          [item.quantity, item.product_id, rows[0].warehouse_id]
        );
        await pool.query(
          'INSERT INTO inventory_transactions (product_id, warehouse_id, transaction_type, quantity, reference_type, reference_id, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7)',
          [item.product_id, rows[0].warehouse_id, 'purchase_return', -item.quantity, 'purchase_return', rows[0].id,  req.user.role_name.includes('admin') ? req.user.id : req.user.admin_id]
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
      'UPDATE purchase_returns SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id',
      [req.params.id]
    );
    if (!rows[0]) return errorResponse(res, 'Purchase return not found', 404);
    successResponse(res, null, 'Purchase return deleted');
  } catch (err) {
    errorResponse(res, 'Failed to delete purchase return', 500);
  }
};

module.exports = { getAll, getById, create, updateStatus, remove };
