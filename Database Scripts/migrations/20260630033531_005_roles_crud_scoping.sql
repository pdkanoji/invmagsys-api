-- Add created_by to roles table for scoping
ALTER TABLE roles ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE roles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Add admin_id (parent admin) to users for hierarchical scoping
-- This tracks which admin owns a subordinate user
ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_id UUID REFERENCES users(id) ON DELETE CASCADE;

-- Index for fast scoping queries
CREATE INDEX IF NOT EXISTS idx_users_admin_id ON users(admin_id);
CREATE INDEX IF NOT EXISTS idx_roles_created_by ON roles(created_by);
