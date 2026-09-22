import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import {
  canOpenQuotationDocument,
  mustRestrictQuotationToCreator,
  resolveQuotationViewScope,
} from "../lib/quotations/access-policy.ts";

test("quotation view scope preserves broad permissions and adds own-only scope", () => {
  assert.equal(resolveQuotationViewScope("admin", new Set()), "all");
  assert.equal(
    resolveQuotationViewScope("employee", new Set(["quotations.view"])),
    "all",
  );
  assert.equal(
    resolveQuotationViewScope("employee", new Set(["quotations.view_all"])),
    "all",
  );
  assert.equal(
    resolveQuotationViewScope("employee", new Set(["quotations.view_own"])),
    "own",
  );
  assert.equal(resolveQuotationViewScope("employee", new Set()), null);
});

test("own-only scope restricts creator records without granting document print", () => {
  const ownOnly = new Set(["quotations.view_own"]);
  const ownWithPrint = new Set(["quotations.view_own", "quotations.print"]);
  const broad = new Set(["quotations.view"]);

  assert.equal(mustRestrictQuotationToCreator("employee", ownOnly), true);
  assert.equal(mustRestrictQuotationToCreator("employee", broad), false);
  assert.equal(canOpenQuotationDocument("employee", ownOnly), false);
  assert.equal(canOpenQuotationDocument("employee", ownWithPrint), true);
  assert.equal(canOpenQuotationDocument("employee", broad), true);
});

test("migration is additive and does not backfill historical quotation ownership", () => {
  const path =
    "supabase/migrations/202608230003_quotation_view_own.sql";
  assert.equal(existsSync(path), true);
  const migration = readFileSync(path, "utf8");

  assert.match(migration, /add column if not exists created_by uuid/i);
  assert.match(migration, /quotations\.view_own/);
  assert.match(migration, /View only quotations created by this employee\./);
  assert.doesNotMatch(migration, /update\s+public\.quotation_requests/i);
  assert.doesNotMatch(migration, /permission_template_items/i);
});

test("server routes and actions apply creator ownership consistently", () => {
  const list = readFileSync("app/admin/quotations/page.tsx", "utf8");
  const manage = readFileSync(
    "app/admin/quotations/[id]/manage/page.tsx",
    "utf8",
  );
  const document = readFileSync("app/admin/quotations/[id]/page.tsx", "utf8");
  const actions = readFileSync("app/admin/quotations/actions.ts", "utf8");
  const workflow = readFileSync(
    "app/admin/quotations/workflow-actions.ts",
    "utf8",
  );
  const navigation = readFileSync("lib/navigation/dashboard.ts", "utf8");

  for (const source of [list, manage, document]) {
    assert.match(source, /requireQuotationView/);
    assert.match(source, /created_by/);
  }
  assert.match(actions, /created_by:\s*profile\.id/);
  assert.match(actions, /quotations\.view_own/);
  assert.match(workflow, /resolveQuotationViewScope/);
  assert.match(workflow, /if \(scope === "own"\)/);
  assert.match(workflow, /\.eq\("created_by",\s*profile\.id\)/);
  assert.match(navigation, /requiredPermission:"quotations\.view_own"/);
});
