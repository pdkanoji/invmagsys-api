const pool = require('../config/database');
const { successResponse, errorResponse, buildPaginationQuery, buildSortQuery, generateUniqueCode } = require('../utils/helpers');
const PDFDocument = require('pdfkit');
const { buildTaxInvoicePDF } = require('../utils/pdfBuilder');
const numberToWords = require('../utils/numberToWords');

const getAll = async (req, res) => {
  try {
    const { page, limit, offset } = buildPaginationQuery(req.query);
    const { sortBy, ascending } = buildSortQuery(req.query, 'sale_date');
    const { search, status, payment_status, customer_id, from_date, to_date } = req.query;

    const conditions = ['s.deleted_at IS NULL'];
    const params = [];

    if (search) { params.push(`%${search}%`); conditions.push(`s.sale_number ILIKE $${params.length}`); }
    if (status) { params.push(status); conditions.push(`s.status = $${params.length}`); }
    if (payment_status) { params.push(payment_status); conditions.push(`s.payment_status = $${params.length}`); }
    if (customer_id) { params.push(customer_id); conditions.push(`s.customer_id = $${params.length}`); }
    if (from_date) { params.push(from_date); conditions.push(`s.sale_date >= $${params.length}`); }
    if (to_date) { params.push(to_date); conditions.push(`s.sale_date <= $${params.length}`); }
    params.push(req.user.role_name.includes('admin') ? req.user.id : req.user.admin_id);
    conditions.push(`s.created_by = $${params.length}`);

    params.push(limit, offset);
    const { rows } = await pool.query(
      `SELECT s.*, c.id AS cust_id, c.name AS cust_name, c.code AS cust_code, w.id AS wh_id, w.name AS wh_name, COUNT(*) OVER() AS total_count
       FROM sales s
       LEFT JOIN customers c ON c.id = s.customer_id
       LEFT JOIN warehouses w ON w.id = s.warehouse_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY s.${sortBy} ${ascending ? 'ASC' : 'DESC'}
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const total = rows.length > 0 ? parseInt(rows[0].total_count) : 0;
    const data = rows.map(r => {
      const { total_count, cust_id, cust_name, cust_code, wh_id, wh_name, ...rest } = r;
      return {
        ...rest,
        customer: cust_id ? { id: cust_id, name: cust_name, code: cust_code } : null,
        warehouse: wh_id ? { id: wh_id, name: wh_name } : null,
      };
    });

    successResponse(res, data, 'Sales fetched', 200, { meta: { total, page, limit, totalPages: Math.ceil(total / limit) } });
  } catch (err) {
    errorResponse(res, 'Failed to fetch sales', 500);
  }
};

const getById = async (req, res) => {
  try {
    const { rows: sRows } = await pool.query(
      `SELECT s.*, row_to_json(c.*) AS customer, json_build_object('id', w.id, 'name', w.name) AS warehouse
       FROM sales s
       LEFT JOIN customers c ON c.id = s.customer_id
       LEFT JOIN warehouses w ON w.id = s.warehouse_id
       WHERE s.id = $1 AND s.deleted_at IS NULL`,
      [req.params.id]
    );
    if (!sRows[0]) return errorResponse(res, 'Sale not found', 404);

    const { rows: items } = await pool.query(
      `SELECT si.*, json_build_object('id', pr.id, 'name', pr.name, 'code', pr.code, 'unit', json_build_object('abbreviation', u.abbreviation)) AS product
       FROM sale_items si
       LEFT JOIN products pr ON pr.id = si.product_id
       LEFT JOIN units u ON u.id = pr.unit_id
       WHERE si.sale_id = $1`,
      [req.params.id]
    );

    successResponse(res, { ...sRows[0], sale_items: items });
  } catch (err) {
    errorResponse(res, 'Failed to fetch sale', 500);
  }
};

const create = async (req, res) => {
  try {
    const { customer_id, warehouse_id, sale_date, due_date, items, notes, discount_amount } = req.body;

    for (const item of items) {
      const { rows } = await pool.query(
        'SELECT available_stock FROM inventory WHERE product_id = $1 AND warehouse_id = $2',
        [item.product_id, warehouse_id]
      );
      if (!rows[0] || rows[0].available_stock < item.quantity) {
        return errorResponse(res, `Insufficient stock for product ${item.product_id}`, 400);
      }
    }

    const sale_number = generateUniqueCode('INV');
    let subtotal = 0, tax_amount = 0;
    const saleItems = items.map(item => {
      const taxAmt = (item.unit_price * item.quantity * (item.tax_percentage || 0)) / 100;
      const disc = (item.unit_price * item.quantity * (item.discount_percentage || 0)) / 100;
      const total = (item.unit_price * item.quantity) - disc + taxAmt;
      subtotal += item.unit_price * item.quantity;
      tax_amount += taxAmt;
      return { ...item, tax_amount: taxAmt, total_price: total };
    });

    const total_amount = subtotal - (discount_amount || 0) + tax_amount;
    const { rows } = await pool.query(
      `INSERT INTO sales (sale_number, customer_id, warehouse_id, sale_date, due_date, subtotal, discount_amount, tax_amount, total_amount, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [sale_number, customer_id, warehouse_id, sale_date, due_date, subtotal, discount_amount || 0, tax_amount, total_amount, notes, req.user.role_name.includes('admin') ? req.user.id : req.user.admin_id]
    );
    const sale = rows[0];

    for (const item of saleItems) {
      await pool.query(
        'INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, discount_percentage, tax_percentage, tax_amount, total_price, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [sale.id, item.product_id, item.quantity, item.unit_price, item.discount_percentage || 0, item.tax_percentage || 0, item.tax_amount, item.total_price, req.user.role_name.includes('admin') ? req.user.id : req.user.admin_id]
      );
    }

    for (const item of items) {
      const { rows: invRows } = await pool.query('SELECT id, current_stock FROM inventory WHERE product_id = $1 AND warehouse_id = $2', [item.product_id, warehouse_id]);
      if (invRows[0]) {
        await pool.query('UPDATE inventory SET current_stock = $1 WHERE id = $2', [invRows[0].current_stock - item.quantity, invRows[0].id]);
      }
      await pool.query(
        'INSERT INTO inventory_transactions (product_id, warehouse_id, transaction_type, quantity, reference_type, reference_id, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [item.product_id, warehouse_id, 'sale', -item.quantity, 'sale', sale.id, req.user.role_name.includes('admin') ? req.user.id : req.user.admin_id]
      );
    }

    successResponse(res, sale, 'Sale order created', 201);
  } catch (err) {
    errorResponse(res, 'Failed to create sale', 500);
  }
};


const generatePDF = async (req, res) => {
  try {
    const { rows: sRows } = await pool.query(
      `SELECT s.*, row_to_json(c.*) AS customer, w.name AS warehouse_name
       FROM sales s
       LEFT JOIN customers c ON c.id = s.customer_id
       LEFT JOIN warehouses w ON w.id = s.warehouse_id
       WHERE s.id = $1 AND s.created_by = $2`,
      [req.params.id, req.user.role_name.includes('admin') ? req.user.id : req.user.admin_id]
    );
    if (!sRows[0]) return errorResponse(res, 'Sale not found', 404);
    const sale = sRows[0];
 
    const { rows: items } = await pool.query(
      `SELECT si.*, pr.name AS product_name, pr.code AS product_code, 
              pr.brand, u.abbreviation AS unit_abbreviation
       FROM sale_items si
       LEFT JOIN products pr ON pr.id = si.product_id
       LEFT JOIN units u ON u.id = pr.unit_id
       WHERE si.sale_id = $1 AND si.created_by = $2`,
      [req.params.id, req.user.role_name.includes('admin') ? req.user.id : req.user.admin_id]
    );
 
    const doc = new PDFDocument({ margin: 0, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="INV-${sale.sale_number}.pdf"`);
    doc.pipe(res);
 
    const customer = sale.customer || {};
 
    // ---- build GST-rate breakup (12/18/28 rows like the sample) ----
    const ratesMap = {};
    items.forEach((i) => {
      const rate = Number(i.gst_percent ?? i.tax_percent ?? 0);
      const qty = Number(i.quantity || 0);
      const unitPrice = Number(i.unit_price || i.price || 0);
      const discPct = Number(i.discount_percent || 0);
      const taxable = Number(i.taxable_amount ?? qty * unitPrice);
      const taxAmt = Number(i.tax_amount ?? (taxable * rate) / 100);
 
      if (!ratesMap[rate]) ratesMap[rate] = { rate, total: 0, sch: 0, disc: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0 };
      ratesMap[rate].total += taxable;
      ratesMap[rate].taxable += taxable;
      ratesMap[rate].igst += sale.is_igst ? taxAmt : 0;
      if (!sale.is_igst) {
        ratesMap[rate].cgst += taxAmt / 2;
        ratesMap[rate].sgst += taxAmt / 2;
      }
    });
    const gstBreakup = Object.values(ratesMap).sort((a, b) => a.rate - b.rate);
 
    buildTaxInvoicePDF(doc, {
      docType: 'TAX INVOICE',
      number: sale.sale_number,
      date: sale.sale_date ? new Date(sale.sale_date).toLocaleDateString('en-GB') : '',
      poNo: sale.po_number || '',
      poDate: sale.po_date ? new Date(sale.po_date).toLocaleDateString('en-GB') : '',
      despatchDocNo: sale.despatch_doc_no || '',
      destination: sale.destination || '',
      ewayBill: sale.eway_bill_no || '',
      irnNo: sale.irn_no || '',
      ackNo: sale.ack_no || '',
      terms: sale.terms_of_delivery || '',
 
      company: {
        name: process.env.COMPANY_NAME || 'Company Name',
        address: process.env.COMPANY_ADDRESS || '',
        phone: process.env.COMPANY_PHONE || '',
        email: process.env.COMPANY_EMAIL || '',
        gstin: process.env.COMPANY_GSTIN || '',
      },
 
      entity: {
        billTo: {
          name: customer.name || customer.customer_name || customer.company_name || 'N/A',
          address: customer.address || customer.billing_address || '',
          gstin: customer.gstin || customer.gst_number || '',
          fssai: customer.fssai_no || '',
          phone: customer.phone || customer.mobile || customer.contact_phone || '',
        },
        // uses same details unless you store a separate shipping address on the sale/customer
        shipTo: {
          name: customer.name || customer.customer_name || customer.company_name || 'N/A',
          address: sale.shipping_address || customer.address || customer.billing_address || '',
          gstin: customer.gstin || customer.gst_number || '',
          fssai: customer.fssai_no || '',
          placeOfSupply: sale.place_of_supply || '',
          phone: customer.phone || customer.mobile || customer.contact_phone || '',
        },
      },
 
      items: items.map((i) => ({
        part_no: i.product_code || '',
        product_name: i.product_name || 'Item',
        brand: i.brand || '',
        hsn: i.hsn_code || '',
        quantity: Number(i.quantity || 0),
        mrp: Number(i.mrp || i.unit_price || 0),
        discount: Number(i.discount_percent || 0),
        unit_price: Number(i.unit_price || i.price || 0),
        gst_percent: Number(i.gst_percent ?? i.tax_percent ?? 0),
        total_price: Number(i.total_price ?? i.amount ?? 0),
      })),
 
      totals: {
        amountInWords: numberToWords(Number(sale.total_amount || 0)),
        subtotal: sale.subtotal,
        discount: sale.discount_amount,
        tax_amount: sale.tax_amount,
        crDrNote: sale.cr_dr_note || 0,
        total_amount: sale.total_amount,
      },
 
      gstBreakup,
 
      bank: {
        name: process.env.BANK_NAME || '',
        accountName: process.env.BANK_ACCOUNT_NAME || '',
        accountNo: process.env.BANK_ACCOUNT_NO || '',
        ifsc: process.env.BANK_IFSC || '',
      },
 
      notes: sale.notes,
    });
 
    doc.end();
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      errorResponse(res, 'Failed to generate PDF', 500);
    }
  }
};

const remove = async (req, res) => {
  try {
    const { rows } = await pool.query('UPDATE sales SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id', [req.params.id]);
    if (!rows[0]) return errorResponse(res, 'Sale not found', 404);
    successResponse(res, null, 'Sale deleted');
  } catch (err) {
    errorResponse(res, 'Failed to delete sale', 500);
  }
};

const updateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ['pending', 'confirmed', 'delivered', 'cancelled'];
    if (!status || !allowed.includes(status)) {
      return errorResponse(res, 'Invalid status value', 400);
    }

    const { rows } = await pool.query(
      'UPDATE sales SET status = $1 WHERE id = $2 AND deleted_at IS NULL RETURNING *',
      [status, req.params.id]
    );

    if (!rows[0]) return errorResponse(res, 'Sale not found', 404);
    successResponse(res, rows[0], 'Sale status updated');
  } catch (err) {
    errorResponse(res, 'Failed to update sale status', 500);
  }
};

const getLastPrice = async (req, res) => {
  try {
    const { product_id, customer_id } = req.query;
    if (!product_id) {
      return errorResponse(res, 'Product id is required', 400);
    }

    const conditions = ['s.deleted_at IS NULL', 'si.product_id = $1'];
    const params = [product_id];
    if (customer_id !== undefined && customer_id !== null && customer_id !== '') {
      params.push(customer_id);
      conditions.push('s.customer_id = $2');
    }

    const query = `SELECT si.unit_price FROM sales s
      JOIN sale_items si ON si.sale_id = s.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY s.sale_date DESC, s.created_at DESC
      LIMIT 1`;

    const { rows } = await pool.query(query, params);
    successResponse(res, { price: rows[0]?.unit_price ?? null });
  } catch (err) {
    errorResponse(res, 'Failed to fetch last price', 500);
  }
};

const recordPayment = async (req, res) => {
  try {
    const { amount, payment_method, payment_date, notes } = req.body;
    const paymentAmount = parseFloat(amount);
    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
      return errorResponse(res, 'Valid payment amount is required', 400);
    }

    const { rows: sRows } = await pool.query(
      'SELECT id, total_amount, paid_amount FROM sales WHERE id = $1 AND deleted_at IS NULL',
      [req.params.id]
    );
    if (!sRows[0]) return errorResponse(res, 'Sale not found', 404);

    const sale = sRows[0];
    const currentPaid = parseFloat(sale.paid_amount || 0);
    const totalAmount = parseFloat(sale.total_amount);
    const newPaid = currentPaid + paymentAmount;
    const paymentStatus = newPaid >= totalAmount ? 'paid' : newPaid > 0 ? 'partial' : 'unpaid';
    const pDate = payment_date || new Date().toISOString().split('T')[0];
    const method = payment_method || 'cash';

    await pool.query(
      'INSERT INTO sale_payments (sale_id, amount, payment_method, payment_date, notes, created_by) VALUES ($1,$2,$3,$4,$5,$6)',
      [sale.id, paymentAmount, method, pDate, notes || null, req.user.role_name.includes('admin') ? req.user.id : req.user.admin_id]
    );

    const { rows: updated } = await pool.query(
      'UPDATE sales SET paid_amount=$1, payment_status=$2, payment_method=$3, payment_date=$4, payment_notes=$5 WHERE id=$6 RETURNING *',
      [newPaid, paymentStatus, method, pDate, notes || null, sale.id]
    );

    if (!updated[0]) return errorResponse(res, 'Failed to update sale payment status', 500);
    successResponse(res, updated[0], 'Payment recorded');
  } catch (err) {
    errorResponse(res, 'Failed to record payment', 500);
  }
};

const getPaymentHistory = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT sp.id, sp.amount, sp.payment_method, sp.payment_date, sp.notes, sp.created_at,
              u.first_name, u.last_name
       FROM sale_payments sp
       LEFT JOIN users u ON u.id = sp.created_by
       WHERE sp.sale_id = $1
       ORDER BY sp.created_at DESC`,
      [req.params.id]
    );

    const data = rows.map(({ first_name, last_name, ...r }) => ({
      ...r,
      created_by_user: first_name || last_name ? { first_name, last_name } : null,
    }));

    successResponse(res, data, 'Payment history fetched');
  } catch (err) {
    errorResponse(res, 'Failed to fetch payment history', 500);
  }
};

module.exports = { getAll, getById, create, generatePDF, remove, recordPayment, getPaymentHistory, updateStatus, getLastPrice };
