const pool = require('../config/database');
const { successResponse, errorResponse, buildPaginationQuery, buildSortQuery } = require('../utils/helpers');

const getInventory = async (req, res) => {
  try {
    const { page, limit, offset } = buildPaginationQuery(req.query);
    const { search, warehouse_id, low_stock } = req.query;

    const conditions = [];
    const params = [];

    if (warehouse_id) {
      params.push(warehouse_id);
      conditions.push(`i.warehouse_id = $${params.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit, offset);

    const { rows } = await pool.query(
      `SELECT i.*, p.id AS prod_id, p.name AS prod_name, p.code AS prod_code, p.reorder_level,
              c.name AS cat_name, u.abbreviation AS unit_abbr,
              w.id AS wh_id, w.name AS wh_name,
              COUNT(*) OVER() AS total_count
       FROM inventory i
       LEFT JOIN products p ON p.id = i.product_id
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN units u ON u.id = p.unit_id
       LEFT JOIN warehouses w ON w.id = i.warehouse_id
       ${where}
       ORDER BY i.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const total = rows.length > 0 ? parseInt(rows[0].total_count) : 0;
    let data = rows.map(r => {
      const { total_count, prod_id, prod_name, prod_code, reorder_level, cat_name, unit_abbr, wh_id, wh_name, ...rest } = r;
      return {
        ...rest,
        product: { id: prod_id, name: prod_name, code: prod_code, reorder_level, category: { name: cat_name }, unit: { abbreviation: unit_abbr } },
        warehouse: { id: wh_id, name: wh_name },
      };
    });

    if (search) {
      const s = search.toLowerCase();
      data = data.filter(i => i.product?.name?.toLowerCase().includes(s) || i.product?.code?.toLowerCase().includes(s));
    }
    if (low_stock === 'true') {
      data = data.filter(i => i.available_stock <= (i.product?.reorder_level || 0));
    }

    successResponse(res, data, 'Inventory fetched', 200, { meta: { total, page, limit, totalPages: Math.ceil(total / limit) } });
  } catch (err) {
    errorResponse(res, 'Failed to fetch inventory', 500);
  }
};

const stockIn = async (req, res) => {
  try {
    const { product_id, warehouse_id, quantity, notes } = req.body;
    const { rows } = await pool.query(
      'SELECT id, current_stock FROM inventory WHERE product_id = $1 AND warehouse_id = $2',
      [product_id, warehouse_id]
    );
    const inv = rows[0];

    if (inv) {
      await pool.query('UPDATE inventory SET current_stock = $1 WHERE id = $2', [inv.current_stock + quantity, inv.id]);
    } else {
      await pool.query('INSERT INTO inventory (product_id, warehouse_id, current_stock) VALUES ($1,$2,$3)', [product_id, warehouse_id, quantity]);
    }

    await pool.query(
      'INSERT INTO inventory_transactions (product_id, warehouse_id, transaction_type, quantity, notes, created_by) VALUES ($1,$2,$3,$4,$5,$6)',
      [product_id, warehouse_id, 'stock_in', quantity, notes,  req.user.role_name.includes('admin') ? req.user.id : req.user.admin_id]
    );
    successResponse(res, null, 'Stock added successfully');
  } catch (err) {
    errorResponse(res, 'Stock in failed', 500);
  }
};

const stockOut = async (req, res) => {
  try {
    const { product_id, warehouse_id, quantity, notes } = req.body;
    const { rows } = await pool.query(
      'SELECT id, current_stock, available_stock FROM inventory WHERE product_id = $1 AND warehouse_id = $2',
      [product_id, warehouse_id]
    );
    const inv = rows[0];

    if (!inv || inv.available_stock < quantity) return errorResponse(res, 'Insufficient stock', 400);

    await pool.query('UPDATE inventory SET current_stock = $1 WHERE id = $2', [inv.current_stock - quantity, inv.id]);
    await pool.query(
      'INSERT INTO inventory_transactions (product_id, warehouse_id, transaction_type, quantity, notes, created_by) VALUES ($1,$2,$3,$4,$5,$6)',
      [product_id, warehouse_id, 'stock_out', -quantity, notes,  req.user.role_name.includes('admin') ? req.user.id : req.user.admin_id]
    );
    successResponse(res, null, 'Stock removed successfully');
  } catch (err) {
    errorResponse(res, 'Stock out failed', 500);
  }
};

const adjustment = async (req, res) => {
  try {
    const { product_id, warehouse_id, new_quantity, notes } = req.body;
    const { rows } = await pool.query(
      'SELECT id, current_stock FROM inventory WHERE product_id = $1 AND warehouse_id = $2',
      [product_id, warehouse_id]
    );
    const inv = rows[0];
    const before = inv?.current_stock || 0;
    const diff = new_quantity - before;

    if (inv) {
      await pool.query('UPDATE inventory SET current_stock = $1 WHERE id = $2', [new_quantity, inv.id]);
    } else {
      await pool.query('INSERT INTO inventory (product_id, warehouse_id, current_stock) VALUES ($1,$2,$3)', [product_id, warehouse_id, new_quantity]);
    }

    await pool.query(
      'INSERT INTO inventory_transactions (product_id, warehouse_id, transaction_type, quantity, before_stock, after_stock, notes, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [product_id, warehouse_id, 'adjustment', diff, before, new_quantity, notes, req.user.role_name.includes('admin') ? req.user.id : req.user.admin_id]
    );
    successResponse(res, null, 'Stock adjusted successfully');
  } catch (err) {
    errorResponse(res, 'Adjustment failed', 500);
  }
};

const transfer = async (req, res) => {
  try {
    const { from_warehouse_id, to_warehouse_id, items, notes } = req.body;
    const { generateUniqueCode } = require('../utils/helpers');
    const transfer_number = generateUniqueCode('TRF');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: transferRows } = await client.query(
        'INSERT INTO stock_transfers (transfer_number, from_warehouse_id, to_warehouse_id, notes, status, created_by, completed_at) VALUES ($1,$2,$3,$4,$5,$6,NOW()) RETURNING *',
        [transfer_number, from_warehouse_id, to_warehouse_id, notes, 'completed', req.user.id]
      );
      const transfer = transferRows[0];

      for (const item of items) {
        await client.query(
          'INSERT INTO stock_transfer_items (transfer_id, product_id, quantity) VALUES ($1,$2,$3)',
          [transfer.id, item.product_id, item.quantity]
        );

        const { rows: fromRows } = await client.query(
          'SELECT id, current_stock FROM inventory WHERE product_id = $1 AND warehouse_id = $2',
          [item.product_id, from_warehouse_id]
        );
        const fromInv = fromRows[0];
        if (!fromInv || fromInv.current_stock < item.quantity) {
          await client.query('ROLLBACK');
          return errorResponse(res, `Insufficient stock for product ${item.product_id}`, 400);
        }
        await client.query('UPDATE inventory SET current_stock = $1 WHERE id = $2', [fromInv.current_stock - item.quantity, fromInv.id]);

        const { rows: toRows } = await client.query(
          'SELECT id, current_stock FROM inventory WHERE product_id = $1 AND warehouse_id = $2',
          [item.product_id, to_warehouse_id]
        );
        const toInv = toRows[0];
        if (toInv) {
          await client.query('UPDATE inventory SET current_stock = $1 WHERE id = $2', [toInv.current_stock + item.quantity, toInv.id]);
        } else {
          await client.query('INSERT INTO inventory (product_id, warehouse_id, current_stock) VALUES ($1,$2,$3)', [item.product_id, to_warehouse_id, item.quantity]);
        }
      }

      await client.query('COMMIT');
      successResponse(res, transfer, 'Stock transferred successfully');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    errorResponse(res, 'Transfer failed', 500);
  }
};

const getTransactions = async (req, res) => {
  try {
    const { page, limit, offset } = buildPaginationQuery(req.query);
    const { product_id, warehouse_id, transaction_type } = req.query;

    const conditions = [];
    const params = [];

    if (product_id) { params.push(product_id); conditions.push(`it.product_id = $${params.length}`); }
    if (warehouse_id) { params.push(warehouse_id); conditions.push(`it.warehouse_id = $${params.length}`); }
    if (transaction_type) { params.push(transaction_type); conditions.push(`it.transaction_type = $${params.length}`); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit, offset);

    const { rows } = await pool.query(
      `SELECT it.*, p.id AS prod_id, p.name AS prod_name, p.code AS prod_code,
              w.id AS wh_id, w.name AS wh_name, COUNT(*) OVER() AS total_count
       FROM inventory_transactions it
       LEFT JOIN products p ON p.id = it.product_id
       LEFT JOIN warehouses w ON w.id = it.warehouse_id
       ${where}
       ORDER BY it.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const total = rows.length > 0 ? parseInt(rows[0].total_count) : 0;
    const data = rows.map(r => {
      const { total_count, prod_id, prod_name, prod_code, wh_id, wh_name, ...rest } = r;
      return { ...rest, product: { id: prod_id, name: prod_name, code: prod_code }, warehouse: { id: wh_id, name: wh_name } };
    });

    successResponse(res, data, 'Transactions fetched', 200, { meta: { total, page, limit, totalPages: Math.ceil(total / limit) } });
  } catch (err) {
    errorResponse(res, 'Failed to fetch transactions', 500);
  }
};

module.exports = { getInventory, stockIn, stockOut, adjustment, transfer, getTransactions };
