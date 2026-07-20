# SEN Permission Model

## Roles and status

Public registration always creates a customer. Only an active admin may assign employee or admin role. An account must be active before it can enter protected areas.

An active admin has full access and never depends on employee permission assignments. An active employee receives one active template plus individual overrides. A customer, suspended account or disabled account has no employee access.

## Resolution order

1. Inactive account: deny.
2. Active admin: allow.
3. Non-employee: deny.
4. Explicit deny override: deny.
5. Explicit allow override: allow.
6. Active template contains permission: allow.
7. Otherwise: deny.

Standard Employee is the only seeded template and contains `dashboard.view` and `activity.view_own`. Sensitive permissions are never automatically granted.

## Server authorization

Authorization helpers live in `lib/auth/permissions.ts`: `getEffectivePermissions`, `hasPermission`, `requirePermission`, `requireAnyPermission`, `requireAllPermissions`, `getPermissionMatrix`, template assignment and override/account update helpers.

A future inventory page must guard the route close to its data source:

```tsx
import { requirePermission } from "@/lib/auth/permissions";

export default async function InventoryPage() {
  await requirePermission("inventory.view");
  // Fetch only authorized inventory data here.
}
```

Every Server Action must repeat the relevant guard. Hiding a navigation link is only a usability feature.

## Adding a future permission

Add the stable key through a new migration, associate it with one module, mark sensitivity intentionally, protect the server route/action, then expose an implemented navigation destination only when the module exists. Never authorize with labels, names or email addresses.
