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
    allowed_permission_keys: ["products.view"],
    denied_permission_keys: [],
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
  const [workspaceResponse, allowedResponse, deniedResponse] = await Promise.all([
    request("/employee"),
    request("/admin/products"),
    request("/admin/orders"),
  ]);
  const deniedHtml = await deniedResponse.text();
  const redirectMarker = deniedHtml.match(/NEXT_REDIRECT.{0,240}/)?.[0] ?? null;
  const directRedirect = [303, 307, 308].includes(deniedResponse.status);
  const streamedRedirect =
    deniedResponse.status === 200 &&
    redirectMarker?.includes("NEXT_REDIRECT;replace;/employee;307;");

  assert.equal(workspaceResponse.status, 200, "Employee workspace should load offline.");
  assert.equal(allowedResponse.status, 200, "An offline employee should open an explicitly permitted module.");
  assert.ok(
    directRedirect || streamedRedirect,
    `A denied offline module should redirect, received ${deniedResponse.status}; ` +
      `renderedOrders=${deniedHtml.includes("Create, reserve, allocate, pack and ship customer orders.")}; ` +
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
    deniedHtml.includes("Create, reserve, allocate, pack and ship customer orders."),
    false,
    "A denied offline module must not render protected content.",
  );

  console.log("Offline permission integration verification passed.");
} finally {
  await cleanup();
}
