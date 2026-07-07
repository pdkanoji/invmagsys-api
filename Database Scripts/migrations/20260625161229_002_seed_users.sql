INSERT INTO users (email, password_hash, first_name, last_name, role_id, is_active, email_verified)
SELECT
  u.email,
  crypt(u.password, gen_salt('bf', 10)),
  u.first_name,
  u.last_name,
  r.id,
  TRUE,
  TRUE
FROM (VALUES
  ('superadmin@example.com', 'Admin@1234', 'Super',     'Admin',     'super_admin'),
  ('admin@example.com',      'Admin@1234', 'Admin',      'User',      'admin'),
  ('manager@example.com',    'Admin@1234', 'Manager',    'User',      'manager'),
  ('sales@example.com',      'Admin@1234', 'Sales',      'User',      'sales_user'),
  ('inventory@example.com',  'Admin@1234', 'Inventory',  'User',      'inventory_user')
) AS u(email, password, first_name, last_name, role_name)
JOIN roles r ON r.name = u.role_name;
