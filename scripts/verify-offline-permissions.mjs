import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

function parseEnvironment(source) {
  const values = {};

  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;

    const [, name, rawValue] = match;
    values[name] = rawValue.replace(/^(["'])(.*)\1$/, "$2");
  }

  return values;
}

const environment = {
  ...parseEnvironment(
    await readFile(new URL("../.env.local", import.meta.url), "utf8").catch(() => ""),
  ),
  ...process.env,
};
const supabaseUrl = environment.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const adminKey = environment.SUPABASE_SECRET_KEY ?? environment.SUPABASE_SERVICE_ROLE_KEY;

assert.ok(supabaseUrl, "Offline Supabase URL is required.");
assert.ok(publishableKey, "Offline Supabase publishable key is required.");
assert.ok(adminKey, "Offline Supabase server credential is required.");

const admin = createClient(supabaseUrl, adminKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const email = `permission-offline-test-${Date.now()}@example.invalid`;
const password = `Local-${randomUUID()}-9a`;
let testProfileId;

async function verifyDevelopmentOrigin() {
  try {
    const response = await fetch("http://localhost:3000/_next/webpack-hmr", {
      headers: { origin: "http://127.0.0.1:3000" },
      signal: AbortSignal.timeout(1_000),
    });
    assert.notEqual(
      response.status,
      403,
      "Next.js must allow 127.0.0.1 to load local development resources.",
    );
  } catch (error) {
    if (error?.name !== "TimeoutError") throw error;
  }
}

async function cleanup() {
  if (!testProfileId) return;

  await admin
    .from("audit_logs")
    .delete()
    .or(`actor_id.eq.${testProfileId},target_profile_id.eq.${testProfileId}`);
  await admin
    .from("profile_permission_overrides")
    .delete()
    .eq("profile_id", testProfileId);
  await admin
    .from("profile_permission_templates")
    .delete()
    .eq("profile_id", testProfileId);
  await admin.auth.admin.deleteUser(testProfileId, false);
}

try {
  await verifyDevelopmentOrigin();

  const [
    { data: actor, error: actorError },
    { data: template, error: templateError },
  ] = await Promise.all([
    admin
      .from("profiles")
      .select("id")
      .eq("role", "admin")
      .eq("status", "active")
      .limit(1)
      .single(),
    admin
      .from("permission_templates")
      .select("id")
      .eq("is_default", true)
      .eq("is_active", true)
      .limit(1)
      .single(),
  ]);
  assert.ifError(actorError);
  assert.ifError(templateError);

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  assert.ifError(createError);
  assert.ok(created.user, "Temporary offline auth user was not created.");
  testProfileId = created.user.id;

  const { error: accessError } = await admin.rpc("admin_update_profile_access", {
    actor_profile_id: actor.id,
    target_profile_id: testProfileId,
    requested_role: "employee",
    requested_status: "active",
    requested_template_id: template.id,
  });
  assert.ifError(accessError);

  const { error: permissionError } = await admin.rpc("admin_set_profile_permissions", {
    actor_profile_id: actor.id,
    target_profile_id: testProfileId,
    requested_template_id: template.id,
    allowed_permission_keys: ["employees.view"],
    denied_permission_keys: ["dashboard.view", "activity.view_own"],
  });
  assert.ifError(permissionError);

  const cookies = new Map();
  const employeeClient = createServerClient(supabaseUrl, publishableKey, {
    cookies: {
      getAll() {
        return [...cookies].map(([name, value]) => ({ name, value }));
      },
      setAll(values) {
        for (const { name, value } of values) cookies.set(name, value);
      },
    },
  });
  const { error: signInError } = await employeeClient.auth.signInWithPassword({
    email,
    password,
  });
  assert.ifError(signInError);

  const cookieHeader = [...cookies]
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
  const request = (path) => fetch(`http://127.0.0.1:3000${path}`, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      cookie: cookieHeader,
    },
    redirect: "manual",
  });

  const permissionRoutes = [
    ["activity.view_own", "/employee/activity"],
    ["employees.view", "/employee/employees"],
    ["crm.view", "/admin/crm"],
    ["products.view", "/admin/products"],
    ["orders.view", "/admin/orders"],
    ["sales.view", "/admin/sales"],
    ["sales.view_all", "/admin/sales"],
    ["sales.view_own", "/admin/sales"],
    ["quotations.view", "/admin/quotations"],
    ["quotations.create", "/admin/quotations/new"],
    ["inventory.view", "/admin/inventory"],
    ["warehouses.view", "/admin/warehouses"],
    ["serials.view", "/admin/serials"],
    ["locations.view", "/admin/work-locations"],
    ["tracking_statuses.view", "/admin/tracking-statuses"],
    ["shipments.view", "/admin/shipments"],
    ["purchasing.view", "/admin/purchasing"],
    ["suppliers.view", "/admin/suppliers"],
    ["accounting.view", "/admin/accounting"],
    ["accounting.manage_cashbook", "/admin/accounting"],
    ["support.view", "/admin/messages"],
  ];
  const protectedRoutes = [...new Set(permissionRoutes.map(([, path]) => path))];
  const forbiddenViewOnlyControls = {
    "products.view": ["Add product", "Archive selected", "Full edit"],
    "orders.view": ["Create order", "Reactivate"],
    "inventory.view": ["Serial Operations", "Quick Inventory Actions"],
    "warehouses.view": ["Add warehouse"],
    "locations.view": ["Create location", "Assign workplace", "Assign warehouse"],
    "tracking_statuses.view": ["Create custom status"],
    "purchasing.view": ["New purchase order", "Export CSV"],
    "suppliers.view": ["Add supplier", "Save supplier"],
    "support.view": ["Close chat", "Send reply"],
    "crm.view": ["New lead", "Export CSV"],
    "sales.view": ["Create Sale", "Record Payment"],
    "sales.view_all": ["Create Sale", "Record Payment"],
    "sales.view_own": ["Create Sale", "Record Payment"],
    "serials.view": ["Generate / receive serials", "Scan or search", "Regenerate eligible", "Print labels", "Export CSV", "Product details"],
  };
  const [workspaceResponse, allowedResponse, deniedResponse] = await Promise.all([
    request("/employee"),
    request("/employee/employees"),
    request("/admin/products"),
  ]);
  const workspaceHtml = await workspaceResponse.text();
  const allowedHtml = await allowedResponse.text();
  const deniedHtml = await deniedResponse.text();
  const redirectMarker = deniedHtml.match(/NEXT_REDIRECT.{0,240}/)?.[0] ?? null;
  const directRedirect = [303, 307, 308].includes(deniedResponse.status);
  const streamedRedirect =
    deniedResponse.status === 200 &&
    redirectMarker?.includes("NEXT_REDIRECT;replace;/employee;307;");

  assert.equal(workspaceResponse.status, 200, "Employee workspace should load offline.");
  assert.equal(allowedResponse.status, 200, "An employee should open the explicitly permitted Employees module.");
  assert.equal(
    workspaceHtml.includes('href="/employee/employees"'),
    true,
    "The employee sidebar should show the explicitly permitted Employees module.",
  );
  assert.equal(
    workspaceHtml.includes('href="/admin/products"'),
    false,
    "The employee sidebar must hide an unchecked Products module.",
  );
  assert.equal(
    allowedHtml.includes("View the active employee directory allowed by your assigned permissions."),
    true,
    "The allowed Employees route should render its protected directory.",
  );
  assert.ok(
    directRedirect || streamedRedirect,
    `A denied offline module should redirect, received ${deniedResponse.status}; ` +
      `renderedProducts=${deniedHtml.includes("Manage SEN simple and variable products, classification, pricing and stock settings.")}; ` +
      `containsEmployeeRedirect=${deniedHtml.includes("/employee")}; ` +
      `redirectMarker=${redirectMarker}.`,
  );
  if (directRedirect) {
    assert.equal(
      new URL(deniedResponse.headers.get("location"), "http://127.0.0.1:3000").pathname,
      "/employee",
      "A denied offline module should redirect to the employee workspace.",
    );
  }
  assert.equal(
    deniedHtml.includes("Manage SEN simple and variable products, classification, pricing and stock settings."),
    false,
    "A denied offline module must not render protected content.",
  );

  for (const [permission, path] of permissionRoutes) {
    const deniedBaseline = permission === "activity.view_own"
      ? ["dashboard.view"]
      : ["dashboard.view", "activity.view_own"];
    const { error: matrixError } = await admin.rpc("admin_set_profile_permissions", {
      actor_profile_id: actor.id,
      target_profile_id: testProfileId,
      requested_template_id: template.id,
      allowed_permission_keys: [permission],
      denied_permission_keys: deniedBaseline,
    });
    assert.ifError(matrixError);

    const deniedPaths = protectedRoutes.filter((candidate) => candidate !== path);
    const [workspace, allowed, ...deniedResponses] = await Promise.all([
      request("/employee"),
      request(path),
      ...deniedPaths.map(request),
    ]);
    const [workspaceBody, allowedBody, ...deniedBodies] = await Promise.all([
      workspace.text(),
      allowed.text(),
      ...deniedResponses.map((response) => response.text()),
    ]);
    assert.equal(workspace.status, 200, `${permission}: employee workspace should load.`);
    assert.equal(allowed.status, 200, `${permission}: ${path} should load.`);
    assert.equal(
      allowedBody.includes("NEXT_REDIRECT"),
      false,
      `${permission}: ${path} must render instead of returning a streamed redirect.`,
    );
    assert.equal(
      workspaceBody.includes(`href="${path}"`),
      true,
      `${permission}: assigned module should appear in employee navigation.`,
    );
    assert.equal(
      allowedBody.includes('href="/admin/users"'),
      false,
      `${permission}: employee module page must not render the unrestricted admin menu.`,
    );
    for (const control of forbiddenViewOnlyControls[permission] ?? []) {
      assert.equal(
        allowedBody.includes(control),
        false,
        `${permission}: view-only page must hide the ${control} control.`,
      );
    }
    deniedResponses.forEach((denied, index) => {
      const deniedLocation = denied.headers.get("location");
      const deniedByResponse = [303, 307, 308].includes(denied.status)
        ? new URL(deniedLocation, "http://127.0.0.1:3000").pathname === "/employee"
        : denied.status === 200 && deniedBodies[index].includes("NEXT_REDIRECT;replace;/employee;307;");
      assert.equal(
        deniedByResponse,
        true,
        `${permission}: unrelated route ${deniedPaths[index]} must remain denied.`,
      );
    });
  }

  console.log(`Offline permission integration verification passed for ${permissionRoutes.length} permission-route cases.`);
} finally {
  await cleanup();
}
