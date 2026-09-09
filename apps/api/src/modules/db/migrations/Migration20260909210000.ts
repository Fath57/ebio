import { Migration } from '@mikro-orm/migrations'
import { ALL_CATALOG_PERMISSIONS, STAFF_ROLES } from '../../auth/casl/admin-permissions.catalog'

/**
 * Back-office staff management: the permission catalogue and the predefined
 * staff roles. Idempotent (same upserts as the RBAC seeder) so production,
 * which never ran the seeder, gets the rows too. Existing roles keep their
 * name; their permission set is replaced by the catalogue definition.
 */
export class Migration20260909210000 extends Migration {
  override async up(): Promise<void> {
    for (const perm of ALL_CATALOG_PERMISSIONS) {
      this.addSql(`INSERT INTO permissions (id, action, subject, description, created_at)
        VALUES (gen_random_uuid(), '${perm.action}', '${perm.subject}', '${escape(perm.description)}', NOW())
        ON CONFLICT (action, subject) DO UPDATE SET description = EXCLUDED.description;`)
    }

    for (const role of STAFF_ROLES) {
      this.addSql(`INSERT INTO roles (id, name, description, is_default, created_at, updated_at)
        VALUES (gen_random_uuid(), '${role.name}', '${escape(role.description)}', false, NOW(), NOW())
        ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description;`)
      this.addSql(`DELETE FROM roles_permissions WHERE role_id = (SELECT id FROM roles WHERE name = '${role.name}');`)
      for (const key of role.permissions) {
        const [action, subject] = key.split(':')
        this.addSql(`INSERT INTO roles_permissions (role_id, permission_id)
          SELECT r.id, p.id FROM roles r, permissions p
          WHERE r.name = '${role.name}' AND p.action = '${action}' AND p.subject = '${subject}'
          ON CONFLICT DO NOTHING;`)
      }
    }
  }

  override async down(): Promise<void> {
    // Rows are data, not schema: leaving them is harmless.
  }
}

function escape(value: string): string {
  return value.replace(/'/g, '\'\'')
}
