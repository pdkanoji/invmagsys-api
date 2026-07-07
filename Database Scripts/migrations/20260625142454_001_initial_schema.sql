
-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Roles
CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO roles (name, description) VALUES
  ('super_admin', 'Full system access'),
  ('admin', 'Administrative access'),
  ('manager', 'Management access'),
  ('sales_user', 'Sales module access'),
  ('inventory_user', 'Inventory module access');

-- Permissions
CREATE TABLE permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  module VARCHAR(50) NOT NULL,
  action VARCHAR(50) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(module, action)
);

-- Role Permissions
CREATE TABLE role_permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(role_id, permission_id)
);

-- Users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  phone VARCHAR(20),
  avatar_url TEXT,
  role_id UUID REFERENCES roles(id),
  is_active BOOLEAN DEFAULT TRUE,
  email_verified BOOLEAN DEFAULT FALSE,
  reset_token VARCHAR(255),
  reset_token_expires TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Warehouses
CREATE TABLE warehouses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  code VARCHAR(20) UNIQUE NOT NULL,
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(100),
  country VARCHAR(100),
  pincode VARCHAR(20),
  manager_name VARCHAR(100),
  manager_phone VARCHAR(20),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Categories
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  code VARCHAR(20) UNIQUE NOT NULL,
  description TEXT,
  parent_id UUID REFERENCES categories(id),
  image_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Units
CREATE TABLE units (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(50) NOT NULL,
  abbreviation VARCHAR(10) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO units (name, abbreviation) VALUES
  ('Pieces', 'PCS'), ('Kilograms', 'KG'), ('Grams', 'G'),
  ('Liters', 'L'), ('Milliliters', 'ML'), ('Meters', 'M'),
  ('Boxes', 'BOX'), ('Cartons', 'CTN'), ('Dozens', 'DZ');

-- Suppliers
CREATE TABLE suppliers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  code VARCHAR(20) UNIQUE NOT NULL,
  email VARCHAR(255),
  mobile VARCHAR(20),
  phone VARCHAR(20),
  gst_number VARCHAR(50),
  pan_number VARCHAR(50),
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(100),
  country VARCHAR(100),
  pincode VARCHAR(20),
  bank_name VARCHAR(100),
  bank_account VARCHAR(50),
  bank_ifsc VARCHAR(20),
  credit_limit DECIMAL(15,2) DEFAULT 0,
  opening_balance DECIMAL(15,2) DEFAULT 0,
  payment_terms TEXT,
  notes TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Customers
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  code VARCHAR(20) UNIQUE NOT NULL,
  email VARCHAR(255),
  mobile VARCHAR(20),
  phone VARCHAR(20),
  gst_number VARCHAR(50),
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(100),
  country VARCHAR(100),
  pincode VARCHAR(20),
  credit_limit DECIMAL(15,2) DEFAULT 0,
  opening_balance DECIMAL(15,2) DEFAULT 0,
  payment_terms TEXT,
  notes TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Products
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(200) NOT NULL,
  category_id UUID REFERENCES categories(id),
  brand VARCHAR(100),
  unit_id UUID REFERENCES units(id),
  description TEXT,
  barcode VARCHAR(100),
  purchase_price DECIMAL(15,2) NOT NULL DEFAULT 0,
  selling_price DECIMAL(15,2) NOT NULL DEFAULT 0,
  tax_percentage DECIMAL(5,2) DEFAULT 0,
  reorder_level INTEGER DEFAULT 0,
  image_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Inventory
CREATE TABLE inventory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID REFERENCES products(id) NOT NULL,
  warehouse_id UUID REFERENCES warehouses(id) NOT NULL,
  current_stock DECIMAL(15,3) DEFAULT 0,
  reserved_stock DECIMAL(15,3) DEFAULT 0,
  damaged_stock DECIMAL(15,3) DEFAULT 0,
  available_stock DECIMAL(15,3) GENERATED ALWAYS AS (current_stock - reserved_stock - damaged_stock) STORED,
  minimum_stock_level DECIMAL(15,3) DEFAULT 0,
  maximum_stock_level DECIMAL(15,3),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(product_id, warehouse_id)
);

-- Inventory Transactions
CREATE TABLE inventory_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID REFERENCES products(id) NOT NULL,
  warehouse_id UUID REFERENCES warehouses(id) NOT NULL,
  transaction_type VARCHAR(30) NOT NULL CHECK (transaction_type IN ('stock_in','stock_out','adjustment','transfer_in','transfer_out','purchase','sale','purchase_return','sale_return','damage')),
  quantity DECIMAL(15,3) NOT NULL,
  before_stock DECIMAL(15,3),
  after_stock DECIMAL(15,3),
  reference_type VARCHAR(50),
  reference_id UUID,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Stock Transfers
CREATE TABLE stock_transfers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transfer_number VARCHAR(50) UNIQUE NOT NULL,
  from_warehouse_id UUID REFERENCES warehouses(id) NOT NULL,
  to_warehouse_id UUID REFERENCES warehouses(id) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','in_transit','completed','cancelled')),
  notes TEXT,
  created_by UUID REFERENCES users(id),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Stock Transfer Items
CREATE TABLE stock_transfer_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transfer_id UUID REFERENCES stock_transfers(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  quantity DECIMAL(15,3) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Purchases
CREATE TABLE purchases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_number VARCHAR(50) UNIQUE NOT NULL,
  supplier_id UUID REFERENCES suppliers(id),
  warehouse_id UUID REFERENCES warehouses(id),
  purchase_date DATE NOT NULL,
  due_date DATE,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','partial','received','cancelled')),
  subtotal DECIMAL(15,2) DEFAULT 0,
  discount_amount DECIMAL(15,2) DEFAULT 0,
  tax_amount DECIMAL(15,2) DEFAULT 0,
  total_amount DECIMAL(15,2) DEFAULT 0,
  paid_amount DECIMAL(15,2) DEFAULT 0,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Purchase Items
CREATE TABLE purchase_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_id UUID REFERENCES purchases(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  quantity DECIMAL(15,3) NOT NULL,
  unit_price DECIMAL(15,2) NOT NULL,
  discount_percentage DECIMAL(5,2) DEFAULT 0,
  tax_percentage DECIMAL(5,2) DEFAULT 0,
  tax_amount DECIMAL(15,2) DEFAULT 0,
  total_price DECIMAL(15,2) NOT NULL,
  received_quantity DECIMAL(15,3) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Purchase Returns
CREATE TABLE purchase_returns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  return_number VARCHAR(50) UNIQUE NOT NULL,
  purchase_id UUID REFERENCES purchases(id),
  supplier_id UUID REFERENCES suppliers(id),
  return_date DATE NOT NULL,
  total_amount DECIMAL(15,2) DEFAULT 0,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Purchase Return Items
CREATE TABLE purchase_return_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  return_id UUID REFERENCES purchase_returns(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  quantity DECIMAL(15,3) NOT NULL,
  unit_price DECIMAL(15,2) NOT NULL,
  total_price DECIMAL(15,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sales
CREATE TABLE sales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_number VARCHAR(50) UNIQUE NOT NULL,
  customer_id UUID REFERENCES customers(id),
  warehouse_id UUID REFERENCES warehouses(id),
  sale_date DATE NOT NULL,
  due_date DATE,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','confirmed','delivered','cancelled')),
  payment_status VARCHAR(20) DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','partial','paid')),
  subtotal DECIMAL(15,2) DEFAULT 0,
  discount_amount DECIMAL(15,2) DEFAULT 0,
  tax_amount DECIMAL(15,2) DEFAULT 0,
  total_amount DECIMAL(15,2) DEFAULT 0,
  paid_amount DECIMAL(15,2) DEFAULT 0,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Sale Items
CREATE TABLE sale_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_id UUID REFERENCES sales(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  quantity DECIMAL(15,3) NOT NULL,
  unit_price DECIMAL(15,2) NOT NULL,
  discount_percentage DECIMAL(5,2) DEFAULT 0,
  tax_percentage DECIMAL(5,2) DEFAULT 0,
  tax_amount DECIMAL(15,2) DEFAULT 0,
  total_price DECIMAL(15,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sale Returns
CREATE TABLE sale_returns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  return_number VARCHAR(50) UNIQUE NOT NULL,
  sale_id UUID REFERENCES sales(id),
  customer_id UUID REFERENCES customers(id),
  return_date DATE NOT NULL,
  total_amount DECIMAL(15,2) DEFAULT 0,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sale Return Items
CREATE TABLE sale_return_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  return_id UUID REFERENCES sale_returns(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  quantity DECIMAL(15,3) NOT NULL,
  unit_price DECIMAL(15,2) NOT NULL,
  total_price DECIMAL(15,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notifications
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type VARCHAR(50) NOT NULL CHECK (type IN ('low_stock','out_of_stock','expiry','pending_payment','system')),
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  reference_type VARCHAR(50),
  reference_id UUID,
  is_read BOOLEAN DEFAULT FALSE,
  user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit Logs
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  action VARCHAR(50) NOT NULL,
  module VARCHAR(50) NOT NULL,
  record_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_products_category ON products(category_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_products_code ON products(code) WHERE deleted_at IS NULL;
CREATE INDEX idx_inventory_product ON inventory(product_id);
CREATE INDEX idx_inventory_warehouse ON inventory(warehouse_id);
CREATE INDEX idx_inventory_transactions_product ON inventory_transactions(product_id);
CREATE INDEX idx_inventory_transactions_created ON inventory_transactions(created_at);
CREATE INDEX idx_purchases_supplier ON purchases(supplier_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_purchases_date ON purchases(purchase_date) WHERE deleted_at IS NULL;
CREATE INDEX idx_sales_customer ON sales(customer_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_sales_date ON sales(sale_date) WHERE deleted_at IS NULL;
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at);
CREATE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_categories_updated_at BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_suppliers_updated_at BEFORE UPDATE ON suppliers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_warehouses_updated_at BEFORE UPDATE ON warehouses FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_purchases_updated_at BEFORE UPDATE ON purchases FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_sales_updated_at BEFORE UPDATE ON sales FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_inventory_updated_at BEFORE UPDATE ON inventory FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_stock_transfers_updated_at BEFORE UPDATE ON stock_transfers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
