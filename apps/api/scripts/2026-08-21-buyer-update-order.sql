-- The BUYER RBAC role lacked update:Order, silently blocking delivery
-- confirmation and cancellation for every buyer (the DB role overrides the
-- code fallback). Idempotent.

BEGIN;

INSERT INTO roles_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'BUYER'
  AND p.action = 'update' AND p.subject = 'Order'
  AND NOT EXISTS (
    SELECT 1 FROM roles_permissions rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

COMMIT;
