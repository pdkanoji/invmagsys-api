const pool = require('../config/database');
const { successResponse, errorResponse, buildPaginationQuery, buildSortQuery, generateUniqueCode } = require('../utils/helpers');

const getAll = async (req, res) => {
  try {
    const { page, limit, offset } = buildPaginationQuery(req.query);
    const { sortBy, ascending } = buildSortQuery(req.query, 'purchase_date');
    const { search, status, supplier_id, from_date, to_date } = req.query;

    const conditions = ['p.deleted_at IS NULL'];
    const params = [];

    if (search) { params.push(`%${search}%`); conditions.push(`p.purchase_number ILIKE $${params.length}`); }
    if (status) { params.push(status); conditions.push(`p.status = $${params.length}`); }
    if (supplier_id) { params.push(supplier_id); conditions.push(`p.supplier_id = $${params.length}`); }
    if (from_date) { params.push(from_date); conditions.push(`p.purchase_date >= $${params.length}`); }
    if (to_date) { params.push(to_date); conditions.push(`p.purchase_date <= $${params.length}`); }
    params.push(req.user.role_name.includes('admin') ? req.user.id : req.user.admin_id);
    conditions.push(`p.created_by = $${params.length}`);

    params.push(limit, offset);

    const query =
      `SELECT p.*, s.id AS sup_id, s.name AS sup_name, s.code AS sup_code, w.id AS wh_id, w.name AS wh_name,
              u.id AS usr_id, u.first_name AS usr_first, u.last_name AS usr_last, COUNT(*) OVER() AS total_count
       FROM purchases p
       LEFT JOIN suppliers s ON s.id = p.supplier_id
       LEFT JOIN warehouses w ON w.id = p.warehouse_id
       LEFT JOIN users u ON u.id = p.created_by
       WHERE ${conditions.join(' AND ')}
       ORDER BY p.${sortBy} ${ascending ? 'ASC' : 'DESC'}
       LIMIT $${params.length - 1} OFFSET $${params.length}`;
       
    const { rows } = await pool.query(query, params);

    const total = rows.length > 0 ? parseInt(rows[0].total_count) : 0;
    const data = rows.map(r => {
      const { total_count, sup_id, sup_name, sup_code, wh_id, wh_name, usr_id, usr_first, usr_last, ...rest } = r;
      return {
        ...rest,
        supplier: sup_id ? { id: sup_id, name: sup_name, code: sup_code } : null,
        warehouse: wh_id ? { id: wh_id, name: wh_name } : null,
        created_by_user: usr_id ? { id: usr_id, first_name: usr_first, last_name: usr_last } : null,
      };
    });

    successResponse(res, data, 'Purchases fetched', 200, { meta: { total, page, limit, totalPages: Math.ceil(total / limit) } });
  } catch (err) {
    console.error(err);
    errorResponse(res, 'Failed to fetch purchases', 500);
  }
};

const getById = async (req, res) => {
  try {
    const { rows: pRows } = await pool.query(
      `SELECT p.*, row_to_json(s.*) AS supplier, json_build_object('id', w.id, 'name', w.name) AS warehouse
       FROM purchases p
       LEFT JOIN suppliers s ON s.id = p.supplier_id
       LEFT JOIN warehouses w ON w.id = p.warehouse_id
       WHERE p.id = $1 AND p.created_by = $2 AND p.deleted_at IS NULL`,
      [req.params.id, req.user.role_name.includes('admin') ? req.user.id : req.user.admin_id]
    );
    if (!pRows[0]) return errorResponse(res, 'Purchase not found', 404);

    const { rows: items } = await pool.query(
      `SELECT pi.*, json_build_object('id', pr.id, 'name', pr.name, 'code', pr.code, 'unit', json_build_object('abbreviation', u.abbreviation)) AS product
       FROM purchase_items pi
       LEFT JOIN products pr ON pr.id = pi.product_id
       LEFT JOIN units u ON u.id = pr.unit_id
       WHERE pi.purchase_id = $1 AND pi.created_by = $2`,
      [req.params.id, req.user.role_name.includes('admin') ? req.user.id : req.user.admin_id]
    );

    successResponse(res, { ...pRows[0], purchase_items: items });
  } catch (err) {
    errorResponse(res, 'Failed to fetch purchase', 500);
  }
};

const create = async (req, res) => {
  try {
    const { supplier_id, warehouse_id, purchase_date, due_date, items, notes, discount_amount } = req.body;
    const purchase_number = generateUniqueCode('PO');

    let subtotal = 0, tax_amount = 0;
    const purchaseItems = items.map(item => {
      const taxAmt = (item.unit_price * item.quantity * (item.tax_percentage || 0)) / 100;
      const disc = (item.unit_price * item.quantity * (item.discount_percentage || 0)) / 100;
      const total = (item.unit_price * item.quantity) - disc + taxAmt;
      subtotal += item.unit_price * item.quantity;
      tax_amount += taxAmt;
      return { ...item, tax_amount: taxAmt, total_price: total };
    });

    const total_amount = subtotal - (discount_amount || 0) + tax_amount;

    const { rows } = await pool.query(
      `INSERT INTO purchases (purchase_number, supplier_id, warehouse_id, purchase_date, due_date, subtotal, discount_amount, tax_amount, total_amount, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [purchase_number, supplier_id, warehouse_id, purchase_date, due_date, subtotal, discount_amount || 0, tax_amount, total_amount, notes, req.user.role_name.includes('admin') ? req.user.id : req.user.admin_id]
    );
    const purchase = rows[0];

    for (const item of purchaseItems) {
      await pool.query(
        'INSERT INTO purchase_items (purchase_id, product_id, quantity, unit_price, discount_percentage, tax_percentage, tax_amount, total_price) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [purchase.id, item.product_id, item.quantity, item.unit_price, item.discount_percentage || 0, item.tax_percentage || 0, item.tax_amount, item.total_price]
      );
    }

    successResponse(res, purchase, 'Purchase order created', 201);
  } catch (err) {
    errorResponse(res, 'Failed to create purchase', 500);
  }
};

const updateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const { rows } = await pool.query(
      'UPDATE purchases SET status = $1 WHERE id = $2 AND created_by = $3 AND deleted_at IS NULL RETURNING *',
      [status, req.params.id, req.user.role_name.includes('admin') ? req.user.id : req.user.admin_id]
    );
    if (!rows[0]) return errorResponse(res, 'Purchase not found', 404);
    const purchase = rows[0];

    if (status === 'received') {
      const { rows: items } = await pool.query('SELECT * FROM purchase_items WHERE purchase_id = $1 AND created_by = $2', [purchase.id, req.user.role_name.includes('admin') ? req.user.id : req.user.admin_id]);
      for (const item of items) {
        const { rows: invRows } = await pool.query(
          'SELECT id, current_stock FROM inventory WHERE product_id = $1 AND warehouse_id = $2',
          [item.product_id, purchase.warehouse_id]
        );
        if (invRows[0]) {
          await pool.query('UPDATE inventory SET current_stock = $1 WHERE id = $2', [invRows[0].current_stock + item.quantity, invRows[0].id]);
        } else {
          await pool.query('INSERT INTO inventory (product_id, warehouse_id, current_stock) VALUES ($1,$2,$3)', [item.product_id, purchase.warehouse_id, item.quantity]);
        }
        await pool.query(
          'INSERT INTO inventory_transactions (product_id, warehouse_id, transaction_type, quantity, reference_type, reference_id, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7)',
          [item.product_id, purchase.warehouse_id, 'purchase', item.quantity, 'purchase', purchase.id, req.user.role_name.includes('admin') ? req.user.id : req.user.admin_id]
        );
      }
    }

    successResponse(res, purchase, 'Purchase status updated');
  } catch (err) {
    errorResponse(res, 'Failed to update purchase status', 500);
  }
};

const generatePDF = async (req, res) => {
  try {
    const { rows: pRows } = await pool.query(
      `SELECT p.*, row_to_json(s.*) AS supplier, w.name AS warehouse_name
       FROM purchases p
       LEFT JOIN suppliers s ON s.id = p.supplier_id
       LEFT JOIN warehouses w ON w.id = p.warehouse_id
       WHERE p.id = $1 AND p.created_by = $2`,
      [req.params.id, req.user.role_name.includes('admin') ? req.user.id : req.user.admin_id]
    );
    if (!pRows[0]) return errorResponse(res, 'Purchase not found', 404);
    const purchase = pRows[0];

    const { rows: items } = await pool.query(
      `SELECT pi.*, pr.name AS product_name, pr.code AS product_code,
              u.abbreviation AS unit_abbreviation
       FROM purchase_items pi
       LEFT JOIN products pr ON pr.id = pi.product_id
       LEFT JOIN units u ON u.id = pr.unit_id
       WHERE pi.purchase_id = $1 AND pi.created_by = $2`,
      [req.params.id, req.user.role_name.includes('admin') ? req.user.id : req.user.admin_id]
    );

    const PDFDocument = require('pdfkit');
    const { buildInvoicePDF } = require('../utils/pdfBuilder');
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="PO-${purchase.purchase_number}.pdf"`);
    doc.pipe(res);

    buildInvoicePDF(doc, {
      docType: 'PURCHASE ORDER',
      number: purchase.purchase_number,
      date: purchase.purchase_date,
      dueDate: purchase.due_date,
      entity: { billTo: purchase.supplier },
      items: items.map(i => ({ ...i, product: { unit: { abbreviation: i.unit_abbreviation } } })),
      totals: {
        subtotal: purchase.subtotal,
        discount: purchase.discount_amount,
        tax_amount: purchase.tax_amount,
        total_amount: purchase.total_amount,
      },
      notes: purchase.notes,
    });

    doc.end();
  } catch (err) {
    errorResponse(res, 'Failed to generate PDF', 500);
  }
};

const remove = async (req, res) => {
  try {
    const { rows } = await pool.query('UPDATE purchases SET deleted_at = NOW() WHERE id = $1 AND created_by = $2 AND deleted_at IS NULL RETURNING id', [req.params.id, req.user.id]);
    if (!rows[0]) return errorResponse(res, 'Purchase not found', 404);
    successResponse(res, null, 'Purchase deleted');
  } catch (err) {
    errorResponse(res, 'Failed to delete purchase', 500);
  }
};

module.exports = { getAll, getById, create, updateStatus, generatePDF, remove };
