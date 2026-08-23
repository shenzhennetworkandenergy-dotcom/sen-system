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
    values[match[1]] = match[2].replace(/^(["'])(.*)\1$/, "$2");
  }
  return values;
}

const environment = {
  ...parseEnvironment(
    await readFile(new URL("../.env.local", import.meta.url), "utf8").catch(
      () => "",
    ),
  ),
  ...process.env,
};
const supabaseUrl = environment.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const adminKey =
  environment.SUPABASE_SECRET_KEY ?? environment.SUPABASE_SERVICE_ROLE_KEY;
const appUrl = environment.QUOTATION_TEST_BASE_URL ?? "http://127.0.0.1:3000";

assert.ok(supabaseUrl, "Local Supabase URL is required.");
assert.ok(publishableKey, "Local Supabase publishable key is required.");
assert.ok(adminKey, "Local Supabase server credential is required.");

const localHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
assert.ok(
  localHosts.has(new URL(supabaseUrl).hostname),
  "Quotation ownership integration tests may only use a local Supabase instance.",
);
assert.ok(
  localHosts.has(new URL(appUrl).hostname),
  "Quotation ownership integration tests may only use a local application.",
);

const admin = createClient(supabaseUrl, adminKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
const employeeA = {
  email: `quotation-own-a-${suffix}@example.invalid`,
  password: `Local-${randomUUID()}-9a`,
};
const employeeB = {
  email: `quotation-own-b-${suffix}@example.invalid`,
  password: `Local-${randomUUID()}-9b`,
};
const customer = {
  email: `quotation-customer-${suffix}@example.invalid`,
  password: `Local-${randomUUID()}-9c`,
};
const createdProfileIds = [];
const quotationIds = [];

async function createUser(credentials) {
  const { data, error } = await admin.auth.admin.createUser({
    email: credentials.email,
    password: credentials.password,
    email_confirm: true,
  });
  assert.ifError(error);
  assert.ok(data.user, `Unable to create ${credentials.email}.`);
  createdProfileIds.push(data.user.id);
  return data.user.id;
}

async function setEmployeeAccess({ actorId, profileId, templateId }) {
  const { error } = await admin.rpc("admin_update_profile_access", {
    actor_profile_id: actorId,
    target_profile_id: profileId,
    requested_role: "employee",
    requested_status: "active",
    requested_template_id: templateId,
  });
  assert.ifError(error);
}

async function setQuotationPermissions({
  actorId,
  profileId,
  templateId,
  allowed,
}) {
  const allQuotationKeys = [
    "quotations.view_own",
    "quotations.view",
    "quotations.view_all",
    "quotations.create",
    "quotations.edit",
    "quotations.approve",
    "quotations.reject",
    "quotations.assign",
    "quotations.send",
    "quotations.export",
    "quotations.print",
    "quotations.convert_to_invoice",
    "quotations.create_customer",
    "quotations.view_history",
  ];
  const { error } = await admin.rpc("admin_set_profile_permissions", {
    actor_profile_id: actorId,
    target_profile_id: profileId,
    requested_template_id: templateId,
    allowed_permission_keys: allowed,
    denied_permission_keys: allQuotationKeys.filter(
      (permission) => !allowed.includes(permission),
    ),
  });
  assert.ifError(error);
}

function isNotFound(response, html) {
  return (
    response.status === 404 ||
    html.includes("NEXT_HTTP_ERROR_FALLBACK;404") ||
    html.includes("This page could not be found")
  );
}

async function cleanup() {
  if (quotationIds.length) {
    const { error: notificationError } = await admin
      .from("customer_notifications")
      .delete()
      .in("entity_id", quotationIds);
    assert.ifError(notificationError);

    const { error: quotationError } = await admin
      .from("quotation_requests")
      .delete()
      .in("id", quotationIds);
    assert.ifError(quotationError);
  }
  if (createdProfileIds.length) {
    const { error: auditError } = await admin
      .from("audit_logs")
      .delete()
      .or(
        `actor_id.in.(${createdProfileIds.join(",")}),target_profile_id.in.(${createdProfileIds.join(",")})`,
      );
    assert.ifError(auditError);

    const { error: overrideError } = await admin
      .from("profile_permission_overrides")
      .delete()
      .in("profile_id", createdProfileIds);
    assert.ifError(overrideError);

    const { error: templateError } = await admin
      .from("profile_permission_templates")
      .delete()
      .in("profile_id", createdProfileIds);
    assert.ifError(templateError);

    for (const profileId of createdProfileIds.toReversed()) {
      const { error: deleteUserError } = await admin.auth.admin.deleteUser(
        profileId,
        false,
      );
      assert.ifError(deleteUserError);
    }
  }
}

try {
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

  const [employeeAId, employeeBId, customerId] = await Promise.all([
    createUser(employeeA),
    createUser(employeeB),
    createUser(customer),
  ]);
  await Promise.all([
    setEmployeeAccess({
      actorId: actor.id,
      profileId: employeeAId,
      templateId: template.id,
    }),
    setEmployeeAccess({
      actorId: actor.id,
      profileId: employeeBId,
      templateId: template.id,
    }),
  ]);
  await setQuotationPermissions({
    actorId: actor.id,
    profileId: employeeAId,
    templateId: template.id,
    allowed: ["quotations.view_own"],
  });

  const ownReference = `QOWN-${suffix}`;
  const foreignReference = `QFOREIGN-${suffix}`;
  const { data: quotations, error: quotationError } = await admin
    .from("quotation_requests")
    .insert([
      {
        reference: ownReference,
        profile_id: customerId,
        created_by: employeeAId,
        subject: `Own quotation ${suffix}`,
        status: "submitted",
      },
      {
        reference: foreignReference,
        profile_id: customerId,
        created_by: employeeBId,
        subject: `Foreign quotation ${suffix}`,
        status: "submitted",
      },
    ])
    .select("id,reference");
  assert.ifError(quotationError);
  assert.equal(quotations.length, 2);
  quotationIds.push(...quotations.map((quotation) => quotation.id));
  const ownId = quotations.find(
    (quotation) => quotation.reference === ownReference,
  ).id;
  const foreignId = quotations.find(
    (quotation) => quotation.reference === foreignReference,
  ).id;

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
  const { error: signInError } = await employeeClient.auth.signInWithPassword(
    employeeA,
  );
  assert.ifError(signInError);
  const cookieHeader = [...cookies]
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
  const request = async (path) => {
    const response = await fetch(`${appUrl}${path}`, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        cookie: cookieHeader,
      },
      redirect: "manual",
    });
    return { response, html: await response.text() };
  };

  const list = await request("/admin/quotations");
  assert.equal(list.response.status, 200);
  assert.ok(list.html.includes(ownReference));
  assert.equal(list.html.includes(foreignReference), false);

  const ownManage = await request(`/admin/quotations/${ownId}/manage`);
  const foreignManage = await request(`/admin/quotations/${foreignId}/manage`);
  assert.equal(ownManage.response.status, 200);
  assert.ok(ownManage.html.includes(ownReference));
  assert.equal(ownManage.html.includes("Save quotation details"), false);
  assert.equal(ownManage.html.includes(">Approve<"), false);
  assert.equal(ownManage.html.includes("Convert to Sales Invoice"), false);
  assert.ok(isNotFound(foreignManage.response, foreignManage.html));
  assert.equal(foreignManage.html.includes(foreignReference), false);

  const ownDocumentDenied = await request(`/admin/quotations/${ownId}`);
  assert.ok(isNotFound(ownDocumentDenied.response, ownDocumentDenied.html));

  await setQuotationPermissions({
    actorId: actor.id,
    profileId: employeeAId,
    templateId: template.id,
    allowed: ["quotations.view_own", "quotations.print"],
  });
  const ownDocument = await request(`/admin/quotations/${ownId}`);
  const foreignDocument = await request(`/admin/quotations/${foreignId}`);
  assert.equal(ownDocument.response.status, 200);
  assert.ok(ownDocument.html.includes(ownReference));
  assert.ok(isNotFound(foreignDocument.response, foreignDocument.html));

  await setQuotationPermissions({
    actorId: actor.id,
    profileId: employeeAId,
    templateId: template.id,
    allowed: ["quotations.view_all"],
  });
  const broadList = await request("/admin/quotations");
  const broadManage = await request(`/admin/quotations/${foreignId}/manage`);
  assert.equal(broadList.response.status, 200);
  assert.ok(broadList.html.includes(ownReference));
  assert.ok(broadList.html.includes(foreignReference));
  assert.equal(broadManage.response.status, 200);
  assert.ok(broadManage.html.includes(foreignReference));

  console.log(
    "Quotation own-view list, direct URL, print independence, and view-all integration passed.",
  );
} finally {
  await cleanup();
}
