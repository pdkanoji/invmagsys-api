-- Purchase payments table (mirrors sale_payments)
CREATE TABLE IF NOT EXISTS purchase_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_id UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  amount DECIMAL(15,2) NOT NULL,
  payment_method VARCHAR(50) NOT NULL DEFAULT 'cash',
  payment_date DATE NOT NULL,
  reference_number VARCHAR(100),
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE purchase_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_purchase_payments" ON purchase_payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_purchase_payments" ON purchase_payments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_purchase_payments" ON purchase_payments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_purchase_payments" ON purchase_payments FOR DELETE TO authenticated USING (true);

-- Add payment columns to purchases if not exists
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'unpaid';
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50);
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS payment_date DATE;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS payment_notes TEXT;

-- Purchase returns
CREATE TABLE IF NOT EXISTS purchase_returns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  return_number VARCHAR(50) UNIQUE NOT NULL,
  purchase_id UUID NOT NULL REFERENCES purchases(id),
  supplier_id UUID REFERENCES suppliers(id),
  warehouse_id UUID REFERENCES warehouses(id),
  return_date DATE NOT NULL,
  reason TEXT,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','approved','completed','cancelled')),
  subtotal DECIMAL(15,2) DEFAULT 0,
  tax_amount DECIMAL(15,2) DEFAULT 0,
  total_amount DECIMAL(15,2) DEFAULT 0,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS purchase_return_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  return_id UUID NOT NULL REFERENCES purchase_returns(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  quantity DECIMAL(15,3) NOT NULL,
  unit_price DECIMAL(15,2) NOT NULL,
  tax_percentage DECIMAL(5,2) DEFAULT 0,
  tax_amount DECIMAL(15,2) DEFAULT 0,
  total_price DECIMAL(15,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE purchase_returns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_purchase_returns" ON purchase_returns FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_purchase_returns" ON purchase_returns FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_purchase_returns" ON purchase_returns FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_purchase_returns" ON purchase_returns FOR DELETE TO authenticated USING (true);

ALTER TABLE purchase_return_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_purchase_return_items" ON purchase_return_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_purchase_return_items" ON purchase_return_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_purchase_return_items" ON purchase_return_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_purchase_return_items" ON purchase_return_items FOR DELETE TO authenticated USING (true);

-- Sale returns
CREATE TABLE IF NOT EXISTS sale_returns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  return_number VARCHAR(50) UNIQUE NOT NULL,
  sale_id UUID NOT NULL REFERENCES sales(id),
  customer_id UUID REFERENCES customers(id),
  warehouse_id UUID REFERENCES warehouses(id),
  return_date DATE NOT NULL,
  reason TEXT,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','approved','completed','cancelled')),
  subtotal DECIMAL(15,2) DEFAULT 0,
  tax_amount DECIMAL(15,2) DEFAULT 0,
  total_amount DECIMAL(15,2) DEFAULT 0,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS sale_return_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  return_id UUID NOT NULL REFERENCES sale_returns(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  quantity DECIMAL(15,3) NOT NULL,
  unit_price DECIMAL(15,2) NOT NULL,
  tax_percentage DECIMAL(5,2) DEFAULT 0,
  tax_amount DECIMAL(15,2) DEFAULT 0,
  total_price DECIMAL(15,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE sale_returns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_sale_returns" ON sale_returns FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_sale_returns" ON sale_returns FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_sale_returns" ON sale_returns FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_sale_returns" ON sale_returns FOR DELETE TO authenticated USING (true);

ALTER TABLE sale_return_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_sale_return_items" ON sale_return_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_sale_return_items" ON sale_return_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_sale_return_items" ON sale_return_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_sale_return_items" ON sale_return_items FOR DELETE TO authenticated USING (true);
