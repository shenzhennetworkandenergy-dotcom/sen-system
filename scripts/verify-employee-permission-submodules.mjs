import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

function parseEnvironment(source) {
  return Object.fromEntries(source.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/);
    return match ? [[match[1], match[2].replace(/^(["'])(.*)\1$/, "$2")]] : [];
  }));
}

const environment = {
  ...parseEnvironment(await readFile(new URL("../.env.local", import.meta.url), "utf8").catch(() => "")),
  ...process.env,
};
const admin = createClient(
  environment.NEXT_PUBLIC_SUPABASE_URL,
  environment.SUPABASE_SECRET_KEY ?? environment.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const createdIds = [];

async function createEmployee(adminActorId, templateId, label) {
  const { data, error } = await admin.auth.admin.createUser({
    email: `permission-submodule-${label}-${Date.now()}-${randomUUID()}@example.invalid`,
    password: `Local-${randomUUID()}-9a`,
    email_confirm: true,
  });
  assert.ifError(error);
  assert.ok(data.user);
  createdIds.push(data.user.id);
  const { error: accessError } = await admin.rpc("admin_update_profile_access", {
    actor_profile_id: adminActorId,
    target_profile_id: data.user.id,
    requested_role: "employee",
    requested_status: "active",
    requested_template_id: templateId,
  });
  assert.ifError(accessError);
  return data.user.id;
}

async function cleanup() {
  for (const id of createdIds) {
    await admin.from("audit_logs").delete().or(`actor_id.eq.${id},target_profile_id.eq.${id}`);
    await admin.from("profile_permission_overrides").delete().eq("profile_id", id);
    await admin.from("profile_permission_templates").delete().eq("profile_id", id);
    await admin.auth.admin.deleteUser(id, false);
  }
}

try {
  const [{ data: actor, error: actorError }, { data: template, error: templateError }] = await Promise.all([
    admin.from("profiles").select("id").eq("role", "admin").eq("status", "active").limit(1).single(),
    admin.from("permission_templates").select("id").eq("is_default", true).eq("is_active", true).limit(1).single(),
  ]);
  assert.ifError(actorError);
  assert.ifError(templateError);

  const managerId = await createEmployee(actor.id, template.id, "manager");
  const targetId = await createEmployee(actor.id, template.id, "target");
  const unauthorizedId = await createEmployee(actor.id, template.id, "unauthorized");
  const baselineDeny = ["dashboard.view", "activity.view_own"];

  assert.ifError((await admin.rpc("admin_set_profile_permissions", {
    actor_profile_id: actor.id,
    target_profile_id: managerId,
    requested_template_id: template.id,
    allowed_permission_keys: ["employees.manage_permissions"],
    denied_permission_keys: baselineDeny,
  })).error);

  const delegated = await admin.rpc("admin_set_profile_permissions", {
    actor_profile_id: managerId,
    target_profile_id: targetId,
    requested_template_id: template.id,
    allowed_permission_keys: ["employees.view", "employees.view_detail"],
    denied_permission_keys: baselineDeny,
  });
  assert.ifError(delegated.error);

  const effective = await admin.rpc("effective_permissions_for_profile", { requested_profile_id: targetId });
  assert.ifError(effective.error);
  assert.deepEqual(
    new Set(effective.data.map((row) => row.permission_key)),
    new Set(["employees.view", "employees.view_detail"]),
  );

  const selfUpdate = await admin.rpc("admin_set_profile_permissions", {
    actor_profile_id: managerId,
    target_profile_id: managerId,
    requested_template_id: template.id,
    allowed_permission_keys: ["employees.manage_permissions", "products.view"],
    denied_permission_keys: baselineDeny,
  });
  assert.match(selfUpdate.error?.message ?? "", /own permissions/i);

  const unauthorized = await admin.rpc("admin_set_profile_permissions", {
    actor_profile_id: unauthorizedId,
    target_profile_id: targetId,
    requested_template_id: template.id,
    allowed_permission_keys: ["products.view"],
    denied_permission_keys: baselineDeny,
  });
  assert.match(unauthorized.error?.message ?? "", /permission manager|required/i);

  console.log("Delegated employee permission management, denial, and self-escalation checks passed.");
} finally {
  await cleanup();
}
