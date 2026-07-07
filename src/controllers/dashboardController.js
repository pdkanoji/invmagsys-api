const pool = require('../config/database');
const { successResponse, errorResponse } = require('../utils/helpers');

const getDashboard = async (req, res) => {
  try {
    const [
      { rows: productCount },
      { rows: categoryCount },
      { rows: inventoryData },
      { rows: purchasesData },
      { rows: salesData },
      { rows: recentTransactions },
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) AS count FROM products WHERE deleted_at IS NULL AND is_active = true AND (created_by = $1 OR created_by IN(SELECT admin_id FROM users WHERE id =$1))', [ req.user.role_name.includes('admin') ? req.user.id : req.user.admin_id]),
      pool.query('SELECT COUNT(*) AS count FROM categories WHERE deleted_at IS NULL AND is_active = true AND (created_by = $1 OR created_by IN(SELECT admin_id FROM users WHERE id =$1))', [req.user.role_name.includes('admin') ? req.user.id : req.user.admin_id]),
      pool.query('SELECT i.current_stock, i.available_stock, i.reserved_stock, i.damaged_stock, p.reorder_level, p.name AS product_name, p.code AS product_code FROM inventory i LEFT JOIN products p ON p.id = i.product_id WHERE (p.created_by = $1 OR p.created_by IN(SELECT admin_id FROM users WHERE id =$1))', [req.user.role_name.includes('admin') ? req.user.id : req.user.admin_id]),
      pool.query('SELECT total_amount, purchase_date, status FROM purchases WHERE deleted_at IS NULL AND (created_by = $1 OR created_by IN(SELECT admin_id FROM users WHERE id =$1))', [req.user.role_name.includes('admin') ? req.user.id : req.user.admin_id]),
      pool.query('SELECT s.total_amount, s.sale_date, s.status, si.quantity, si.unit_price, pr.purchase_price,pr.name AS product_name,pr.code AS product_code FROM sales s LEFT JOIN sale_items si ON si.sale_id = s.id LEFT JOIN products pr ON pr.id = si.product_id WHERE s.deleted_at IS NULL AND (s.created_by = $1 OR s.created_by IN(SELECT admin_id FROM users WHERE id =$1))', [req.user.role_name.includes('admin') ? req.user.id : req.user.admin_id]),
      pool.query('SELECT it.*, p.name AS product_name, p.code AS product_code FROM inventory_transactions it LEFT JOIN products p ON p.id = it.product_id WHERE (it.created_by = $1 OR it.created_by IN(SELECT admin_id FROM users WHERE id =$1)) ORDER BY it.created_at DESC LIMIT 10', [req.user.role_name.includes('admin') ? req.user.id : req.user.admin_id]),
    ]);

    const totalProducts = parseInt(productCount[0].count);
    const totalCategories = parseInt(categoryCount[0].count);

    const totalStock = inventoryData.reduce((s, i) => s + (parseFloat(i.available_stock) || 0), 0);
    const lowStockItems = inventoryData.filter(i => {
      const reorder = i.reorder_level || 0;
      return i.available_stock > 0 && i.available_stock <= reorder;
    }).length;
    const outOfStockItems = inventoryData.filter(i => (i.available_stock || 0) <= 0).length;

    const uniquePurchases = {};
    for (const p of purchasesData) {
      if (!uniquePurchases[p.purchase_date + p.status]) {
        uniquePurchases[p.purchase_date + p.status] = p;
      }
    }
    const totalPurchaseAmount = purchasesData.reduce((s, p) => s + (parseFloat(p.total_amount) || 0), 0);

    const salesMap = {};
    let totalSalesAmount = 0;
    let totalCostOfGoodsSold = 0;
    for (const row of salesData) {
      if (!salesMap[row.sale_date]) {
        salesMap[row.sale_date] = parseFloat(row.total_amount) || 0;
        totalSalesAmount += parseFloat(row.total_amount) || 0;
      }
      totalCostOfGoodsSold += (parseFloat(row.purchase_price) || 0) * (parseFloat(row.quantity) || 0);
    }
    const totalProfit = totalSalesAmount - totalCostOfGoodsSold;

    const monthlyData = {};
    for (const p of purchasesData) {
      const month = p.purchase_date?.toString().substring(0, 7);
      if (month) {
        if (!monthlyData[month]) monthlyData[month] = { month, purchases: 0, sales: 0 };
        monthlyData[month].purchases += parseFloat(p.total_amount) || 0;
      }
    }
    const saleDates = new Set();
    for (const row of salesData) {
      const month = row.sale_date?.toString().substring(0, 7);
      if (month && !saleDates.has(row.sale_date)) {
        saleDates.add(row.sale_date);
        if (!monthlyData[month]) monthlyData[month] = { month, purchases: 0, sales: 0 };
        monthlyData[month].sales += parseFloat(row.total_amount) || 0;
      }
    }
    const monthlyChart = Object.values(monthlyData).sort((a, b) => a.month.localeCompare(b.month)).slice(-12);

    const productSalesMap = {};
    for (const row of salesData) {
      const key = row.product_code || 'unknown';
      if (!productSalesMap[key]) productSalesMap[key] = { name: row.product_name, total_quantity: 0, total_amount: 0 };
      productSalesMap[key].total_quantity += parseFloat(row.quantity) || 0;
      productSalesMap[key].total_amount += (parseFloat(row.unit_price) || 0) * (parseFloat(row.quantity) || 0);
    }
    const topSellingProducts = Object.values(productSalesMap).sort((a, b) => b.total_amount - a.total_amount).slice(0, 10);

    const transactions = recentTransactions.map(r => ({
      ...r,
      product: { name: r.product_name, code: r.product_code },
    }));

    successResponse(res, {
      totalProducts, totalCategories,
      availableStock: totalStock,
      lowStockItems, outOfStockItems,
      totalPurchaseAmount, totalSalesAmount, totalProfit,
      recentTransactions: transactions,
      monthlyChart,
      topSellingProducts,
    });
  } catch (err) {
    errorResponse(res, 'Failed to load dashboard', 500);
  }
};

module.exports = { getDashboard };
