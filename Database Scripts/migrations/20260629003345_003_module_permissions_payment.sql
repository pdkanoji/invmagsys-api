-- Module-level RBAC table (separate from existing role_permissions join table)
CREATE TABLE IF NOT EXISTS module_permissions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_name   TEXT NOT NULL,
  module      TEXT NOT NULL,
  can_view    BOOLEAN NOT NULL DEFAULT FALSE,
  can_create  BOOLEAN NOT NULL DEFAULT FALSE,
  can_edit    BOOLEAN NOT NULL DEFAULT FALSE,
  can_delete  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (role_name, module)
);

ALTER TABLE module_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_module_permissions" ON module_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_module_permissions" ON module_permissions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_module_permissions" ON module_permissions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_module_permissions" ON module_permissions FOR DELETE TO authenticated USING (true);

INSERT INTO module_permissions (role_name, module, can_view, can_create, can_edit, can_delete) VALUES
  ('super_admin','dashboard',TRUE,TRUE,TRUE,TRUE),
  ('super_admin','products',TRUE,TRUE,TRUE,TRUE),
  ('super_admin','categories',TRUE,TRUE,TRUE,TRUE),
  ('super_admin','inventory',TRUE,TRUE,TRUE,TRUE),
  ('super_admin','purchases',TRUE,TRUE,TRUE,TRUE),
  ('super_admin','sales',TRUE,TRUE,TRUE,TRUE),
  ('super_admin','suppliers',TRUE,TRUE,TRUE,TRUE),
  ('super_admin','customers',TRUE,TRUE,TRUE,TRUE),
  ('super_admin','warehouses',TRUE,TRUE,TRUE,TRUE),
  ('super_admin','reports',TRUE,TRUE,TRUE,TRUE),
  ('super_admin','users',TRUE,TRUE,TRUE,TRUE),
  ('super_admin','audit_logs',TRUE,FALSE,FALSE,FALSE),
  ('super_admin','notifications',TRUE,FALSE,FALSE,FALSE),

  ('admin','dashboard',TRUE,TRUE,TRUE,TRUE),
  ('admin','products',TRUE,TRUE,TRUE,TRUE),
  ('admin','categories',TRUE,TRUE,TRUE,TRUE),
  ('admin','inventory',TRUE,TRUE,TRUE,TRUE),
  ('admin','purchases',TRUE,TRUE,TRUE,FALSE),
  ('admin','sales',TRUE,TRUE,TRUE,FALSE),
  ('admin','suppliers',TRUE,TRUE,TRUE,TRUE),
  ('admin','customers',TRUE,TRUE,TRUE,TRUE),
  ('admin','warehouses',TRUE,TRUE,TRUE,TRUE),
  ('admin','reports',TRUE,TRUE,FALSE,FALSE),
  ('admin','users',TRUE,TRUE,TRUE,FALSE),
  ('admin','audit_logs',TRUE,FALSE,FALSE,FALSE),
  ('admin','notifications',TRUE,FALSE,FALSE,FALSE),

  ('manager','dashboard',TRUE,FALSE,FALSE,FALSE),
  ('manager','products',TRUE,TRUE,TRUE,FALSE),
  ('manager','categories',TRUE,TRUE,FALSE,FALSE),
  ('manager','inventory',TRUE,TRUE,TRUE,FALSE),
  ('manager','purchases',TRUE,TRUE,TRUE,FALSE),
  ('manager','sales',TRUE,TRUE,TRUE,FALSE),
  ('manager','suppliers',TRUE,TRUE,TRUE,FALSE),
  ('manager','customers',TRUE,TRUE,TRUE,FALSE),
  ('manager','warehouses',TRUE,FALSE,FALSE,FALSE),
  ('manager','reports',TRUE,FALSE,FALSE,FALSE),
  ('manager','users',FALSE,FALSE,FALSE,FALSE),
  ('manager','audit_logs',FALSE,FALSE,FALSE,FALSE),
  ('manager','notifications',TRUE,FALSE,FALSE,FALSE),

  ('sales_user','dashboard',TRUE,FALSE,FALSE,FALSE),
  ('sales_user','products',TRUE,FALSE,FALSE,FALSE),
  ('sales_user','categories',TRUE,FALSE,FALSE,FALSE),
  ('sales_user','inventory',TRUE,FALSE,FALSE,FALSE),
  ('sales_user','purchases',FALSE,FALSE,FALSE,FALSE),
  ('sales_user','sales',TRUE,TRUE,FALSE,FALSE),
  ('sales_user','suppliers',FALSE,FALSE,FALSE,FALSE),
  ('sales_user','customers',TRUE,TRUE,TRUE,FALSE),
  ('sales_user','warehouses',FALSE,FALSE,FALSE,FALSE),
  ('sales_user','reports',TRUE,FALSE,FALSE,FALSE),
  ('sales_user','users',FALSE,FALSE,FALSE,FALSE),
  ('sales_user','audit_logs',FALSE,FALSE,FALSE,FALSE),
  ('sales_user','notifications',TRUE,FALSE,FALSE,FALSE),

  ('inventory_user','dashboard',TRUE,FALSE,FALSE,FALSE),
  ('inventory_user','products',TRUE,FALSE,FALSE,FALSE),
  ('inventory_user','categories',TRUE,FALSE,FALSE,FALSE),
  ('inventory_user','inventory',TRUE,TRUE,TRUE,FALSE),
  ('inventory_user','purchases',TRUE,FALSE,FALSE,FALSE),
  ('inventory_user','sales',FALSE,FALSE,FALSE,FALSE),
  ('inventory_user','suppliers',TRUE,FALSE,FALSE,FALSE),
  ('inventory_user','customers',FALSE,FALSE,FALSE,FALSE),
  ('inventory_user','warehouses',TRUE,FALSE,FALSE,FALSE),
  ('inventory_user','reports',TRUE,FALSE,FALSE,FALSE),
  ('inventory_user','users',FALSE,FALSE,FALSE,FALSE),
  ('inventory_user','audit_logs',FALSE,FALSE,FALSE,FALSE),
  ('inventory_user','notifications',TRUE,FALSE,FALSE,FALSE)
ON CONFLICT (role_name, module) DO NOTHING;

-- Additional payment columns on sales (idempotent)
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS payment_date   DATE,
  ADD COLUMN IF NOT EXISTS payment_notes  TEXT;

-- Payment history table
CREATE TABLE IF NOT EXISTS sale_payments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id        UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  amount         NUMERIC(12,2) NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'cash',
  payment_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  notes          TEXT,
  created_by     UUID REFERENCES users(id),
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE sale_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_sale_payments" ON sale_payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_sale_payments" ON sale_payments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_sale_payments" ON sale_payments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_sale_payments" ON sale_payments FOR DELETE TO authenticated USING (true);
