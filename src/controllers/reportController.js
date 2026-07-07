const pool = require('../config/database');
const { successResponse, errorResponse } = require('../utils/helpers');

const getInventoryReport = async (req, res) => {
  try {
    const { warehouse_id, low_stock, format } = req.query;
    const conditions = [];
    const params = [];

    if (warehouse_id) { params.push(warehouse_id); conditions.push(`i.warehouse_id = $${params.length}`); }
    params.push(req.user.role_name.includes('admin') ? req.user.id : req.user.admin_id);
    conditions.push(`p.created_by = $${params.length}`);
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await pool.query(
      `SELECT i.*, p.id AS prod_id, p.name AS prod_name, p.code AS prod_code, p.brand, p.purchase_price, p.selling_price, p.reorder_level,
              c.name AS cat_name, u.abbreviation AS unit_abbr, w.name AS wh_name
       FROM inventory i
       LEFT JOIN products p ON p.id = i.product_id
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN units u ON u.id = p.unit_id
       LEFT JOIN warehouses w ON w.id = i.warehouse_id
       ${where}`,
      params
    );

    let data = rows.map(r => {
      const { prod_id, prod_name, prod_code, cat_name, unit_abbr, wh_name, ...rest } = r;
      return {
        ...rest,
        product: { id: prod_id, name: prod_name, code: prod_code, brand: r.brand, purchase_price: r.purchase_price, selling_price: r.selling_price, reorder_level: r.reorder_level, category: { name: cat_name }, unit: { abbreviation: unit_abbr } },
        warehouse: { name: wh_name },
      };
    });

    if (low_stock === 'true') data = data.filter(i => i.available_stock <= (i.product?.reorder_level || 0));

    if (format === 'excel') return exportExcel(res, data, 'Inventory Report');
    if (format === 'csv') return exportCSV(res, data, 'inventory_report');
    successResponse(res, data, 'Inventory report generated');
  } catch (err) {
    errorResponse(res, 'Failed to generate inventory report', 500);
  }
};

const getPurchaseReport = async (req, res) => {
  try {
    const { from_date, to_date, supplier_id, format } = req.query;
    const conditions = ['p.deleted_at IS NULL'];
    const params = [];

    if (from_date) { params.push(from_date); conditions.push(`p.purchase_date >= $${params.length}`); }
    if (to_date) { params.push(to_date); conditions.push(`p.purchase_date <= $${params.length}`); }
    if (supplier_id) { params.push(supplier_id); conditions.push(`p.supplier_id = $${params.length}`); }
    params.push(req.user.role_name.includes('admin') ? req.user.id : req.user.admin_id);
    conditions.push(`p.created_by = $${params.length}`);

    const { rows: purchases } = await pool.query(
      `SELECT p.*, s.name AS supplier_name, w.name AS warehouse_name FROM purchases p
       LEFT JOIN suppliers s ON s.id = p.supplier_id
       LEFT JOIN warehouses w ON w.id = p.warehouse_id
       WHERE ${conditions.join(' AND ')} ORDER BY p.purchase_date DESC`,
      params
    );

    const purchaseIds = purchases.map(p => p.id);
    let itemsMap = {};
    if (purchaseIds.length > 0) {
      const { rows: items } = await pool.query(
        `SELECT pi.*, pr.name AS prod_name, pr.code AS prod_code FROM purchase_items pi LEFT JOIN products pr ON pr.id = pi.product_id WHERE pi.purchase_id = ANY($1)`,
        [purchaseIds]
      );
      for (const item of items) {
        if (!itemsMap[item.purchase_id]) itemsMap[item.purchase_id] = [];
        itemsMap[item.purchase_id].push({ ...item, product: { name: item.prod_name, code: item.prod_code } });
      }
    }

    const data = purchases.map(p => ({
      ...p,
      supplier: { name: p.supplier_name },
      warehouse: { name: p.warehouse_name },
      purchase_items: itemsMap[p.id] || [],
    }));

    const summary = {
      totalOrders: data.length,
      totalAmount: data.reduce((s, p) => s + parseFloat(p.total_amount || 0), 0),
      totalTax: data.reduce((s, p) => s + parseFloat(p.tax_amount || 0), 0),
    };

    if (format === 'excel') return exportExcel(res, data, 'Purchase Report');
    if (format === 'csv') return exportCSV(res, data, 'purchase_report');
    successResponse(res, { data, summary }, 'Purchase report generated');
  } catch (err) {
    errorResponse(res, 'Failed to generate purchase report', 500);
  }
};

const getSalesReport = async (req, res) => {
  try {
    const { from_date, to_date, customer_id, format } = req.query;
    const conditions = ['s.deleted_at IS NULL'];
    const params = [];

    if (from_date) { params.push(from_date); conditions.push(`s.sale_date >= $${params.length}`); }
    if (to_date) { params.push(to_date); conditions.push(`s.sale_date <= $${params.length}`); }
    if (customer_id) { params.push(customer_id); conditions.push(`s.customer_id = $${params.length}`); }
    params.push(req.user.role_name.includes('admin') ? req.user.id : req.user.admin_id);
    conditions.push(`s.created_by = $${params.length}`);

    const { rows: sales } = await pool.query(
      `SELECT s.*, c.name AS customer_name, w.name AS warehouse_name FROM sales s
       LEFT JOIN customers c ON c.id = s.customer_id
       LEFT JOIN warehouses w ON w.id = s.warehouse_id
       WHERE ${conditions.join(' AND ')} ORDER BY s.sale_date DESC`,
      params
    );

    const saleIds = sales.map(s => s.id);
    let itemsMap = {};
    if (saleIds.length > 0) {
      const { rows: items } = await pool.query(
        `SELECT si.*, pr.name AS prod_name, pr.code AS prod_code FROM sale_items si LEFT JOIN products pr ON pr.id = si.product_id WHERE si.sale_id = ANY($1)`,
        [saleIds]
      );
      for (const item of items) {
        if (!itemsMap[item.sale_id]) itemsMap[item.sale_id] = [];
        itemsMap[item.sale_id].push({ ...item, product: { name: item.prod_name, code: item.prod_code } });
      }
    }

    const data = sales.map(s => ({
      ...s,
      customer: { name: s.customer_name },
      warehouse: { name: s.warehouse_name },
      sale_items: itemsMap[s.id] || [],
    }));

    const summary = {
      totalOrders: data.length,
      totalAmount: data.reduce((s, s2) => s + parseFloat(s2.total_amount || 0), 0),
      totalTax: data.reduce((s, s2) => s + parseFloat(s2.tax_amount || 0), 0),
    };

    if (format === 'excel') return exportExcel(res, data, 'Sales Report');
    if (format === 'csv') return exportCSV(res, data, 'sales_report');
    successResponse(res, { data, summary }, 'Sales report generated');
  } catch (err) {
    errorResponse(res, 'Failed to generate sales report', 500);
  }
};

const getProfitLossReport = async (req, res) => {
  try {
    const { from_date, to_date } = req.query;
    const conditions = ['s.deleted_at IS NULL'];
    const params = [];

    if (from_date) { params.push(from_date); conditions.push(`s.sale_date >= $${params.length}`); }
    if (to_date) { params.push(to_date); conditions.push(`s.sale_date <= $${params.length}`); }
    params.push(req.user.role_name.includes('admin') ? req.user.id : req.user.admin_id);
    conditions.push(`s.created_by = $${params.length}`);

    const { rows } = await pool.query(
      `SELECT s.total_amount, s.tax_amount, s.discount_amount, s.sale_date,
              si.quantity, pr.purchase_price
       FROM sales s
       LEFT JOIN sale_items si ON si.sale_id = s.id
       LEFT JOIN products pr ON pr.id = si.product_id
       WHERE ${conditions.join(' AND ')}`,
      params
    );

    const salesSeen = new Set();
    let totalRevenue = 0, totalCOGS = 0, totalTax = 0, totalDiscount = 0;
    const saleDates = new Set();

    for (const row of rows) {
      const key = `${row.sale_date}-${row.total_amount}`;
      if (!salesSeen.has(key)) {
        salesSeen.add(key);
        totalRevenue += parseFloat(row.total_amount || 0);
        totalTax += parseFloat(row.tax_amount || 0);
        totalDiscount += parseFloat(row.discount_amount || 0);
        saleDates.add(key);
      }
      totalCOGS += (parseFloat(row.purchase_price) || 0) * (parseFloat(row.quantity) || 0);
    }

    const grossProfit = totalRevenue - totalCOGS;
    const netProfit = grossProfit - totalTax;

    successResponse(res, { totalRevenue, totalCOGS, grossProfit, netProfit, totalTax, totalDiscount, totalTransactions: salesSeen.size });
  } catch (err) {
    errorResponse(res, 'Failed to generate P&L report', 500);
  }
};

const exportExcel = (res, data, sheetName) => {
  const XLSX = require('xlsx');
  const ws = XLSX.utils.json_to_sheet(data.map(flattenObject));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', `attachment; filename="${sheetName.replace(/ /g, '_')}.xlsx"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buffer);
};

const exportCSV = (res, data, filename) => {
  const flat = data.map(flattenObject);
  if (flat.length === 0) return res.send('No data');
  const headers = Object.keys(flat[0]).join(',');
  const rows = flat.map(r => Object.values(r).map(v => `"${v || ''}"`).join(','));
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
  res.setHeader('Content-Type', 'text/csv');
  res.send([headers, ...rows].join('\n'));
};

const flattenObject = (obj, prefix = '') => {
  const result = {};
  for (const key of Object.keys(obj || {})) {
    const val = obj[key];
    const fullKey = prefix ? `${prefix}_${key}` : key;
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      Object.assign(result, flattenObject(val, fullKey));
    } else if (!Array.isArray(val)) {
      result[fullKey] = val;
    }
  }
  return result;
};

module.exports = { getInventoryReport, getPurchaseReport, getSalesReport, getProfitLossReport };
