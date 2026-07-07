const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { swaggerUi, swaggerSpec } = require('./config/swagger');
const errorHandler = require('./middleware/errorHandler');
const logger = require('./config/logger');
const path = require('path');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const dashboardRoutes = require('./routes/dashboard');
const productRoutes = require('./routes/products');
const categoryRoutes = require('./routes/categories');
const supplierRoutes = require('./routes/suppliers');
const customerRoutes = require('./routes/customers');
const purchaseRoutes = require('./routes/purchases');
const salesRoutes = require('./routes/sales');
const inventoryRoutes = require('./routes/inventory');
const warehouseRoutes = require('./routes/warehouses');
const reportRoutes = require('./routes/reports');
const notificationRoutes = require('./routes/notifications');
const auditLogRoutes = require('./routes/auditLogs');
const unitRoutes = require('./routes/units');
const permissionsRoutes = require('./routes/permissions');
const rolesRoutes = require('./routes/roles');
const purchasePaymentRoutes = require('./routes/purchasePayments');
const purchaseReturnRoutes = require('./routes/purchaseReturns');
const saleReturnRoutes = require('./routes/saleReturns');

const app = express();

app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
});
//app.use('/api', globalLimiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
//app.use('/uploads', express.static('uploads'));
app.use(
  '/uploads',
  express.static(path.join(__dirname, 'uploads'))
);

app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url} - ${req.ip}`);
  next();
});

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/warehouses', warehouseRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/audit-logs', auditLogRoutes);
app.use('/api/units', unitRoutes);
app.use('/api/permissions', permissionsRoutes);
app.use('/api/roles', rolesRoutes);
app.use('/api/purchases', purchasePaymentRoutes);
app.use('/api/purchase-returns', purchaseReturnRoutes);
app.use('/api/sale-returns', saleReturnRoutes);

app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Inventory Management API is running', timestamp: new Date().toISOString() });
});

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

app.use(errorHandler);

module.exports = app;
