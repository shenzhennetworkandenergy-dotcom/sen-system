import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { accountsHost, accountsReturnPath, isAccountsHost, isAccountsRoute, MURSHIDA_ROOT } from "../lib/murshida-manzil/accounts-routing.ts";
import { isPropertiesCookie, propertiesCookieHeader } from "../lib/murshida-manzil/properties-access.ts";

test("only the Properties host and an explicit loopback preview enable Accounts", () => {
  assert.equal(isAccountsHost("murshidaproperties.sen.com.bd"), true);
  for (const host of [null, "sen.com.bd", "www.sen.com.bd", "murshidaproperties.sen.com.bd.evil.test", "localhost:3019"]) {
    assert.equal(isAccountsHost(host, undefined), false);
  }
  assert.equal(isAccountsHost("127.0.0.1:3021", "http://127.0.0.1:3021"), true);
  assert.equal(isAccountsHost("evil.test", "http://evil.test"), false);
  assert.equal(isAccountsHost("127.0.0.1:3021", "http://127.0.0.1:3022"), false);
});

test("the Accounts surface exposes module routes and Properties sessions only", () => {
  for (const path of [MURSHIDA_ROOT, `${MURSHIDA_ROOT}/history/rent`]) assert.equal(isAccountsRoute(path), true);
  for (const path of ["/admin", "/admin/sales", "/api/employee/inventory/work-counts", "/login", "/logout", `${MURSHIDA_ROOT}-other`, "/manzil/other"]) assert.equal(isAccountsRoute(path), false);
  for (const name of ["murshida_properties_session", "sen_control_murshida_session"]) assert.equal(isPropertiesCookie(name), true);
  for (const name of ["murshida-manzil-auth", "sb-local-auth-token", "sessionid", "murshida_properties_csrf"]) assert.equal(isPropertiesCookie(name), false);
  assert.equal(propertiesCookieHeader("sb-local-auth-token=secret; murshida_properties_session=abc123; murshida_properties_csrf=csrf"), "murshida_properties_session=abc123");
});

test("internal action redirects retain the whitelisted host without trusting forwarded hosts from other sites", () => {
  assert.equal(accountsHost(new Headers({ host: "127.0.0.1:3000", "x-forwarded-host": "murshidaproperties.sen.com.bd" })), "murshidaproperties.sen.com.bd");
  assert.equal(accountsHost(new Headers({ host: "www.sen.com.bd", "x-forwarded-host": "murshidaproperties.sen.com.bd" })), null);
  assert.equal(accountsHost(new Headers({ host: "127.0.0.1:3000", "x-forwarded-host": "evil.test" })), null);
});

test("return destinations cannot escape the module or become external redirects", () => {
  const allowed = `${MURSHIDA_ROOT}/reports/owner-rent-account?owner=all&year=2026`;
  assert.equal(accountsReturnPath(allowed), allowed);
  for (const value of [null, "https://evil.test", "//evil.test", "/admin/sales", "/\\evil.test", `${MURSHIDA_ROOT}/%2e%2e/sales`, `${MURSHIDA_ROOT}/%252e%252e/sales`, `${MURSHIDA_ROOT}evil`, `${MURSHIDA_ROOT}/%2fadmin`]) assert.equal(accountsReturnPath(value), MURSHIDA_ROOT);
});

test("every protected module entry uses the scoped guard instead of the general ERP session", () => {
  const walk = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : /\.[tj]sx?$/.test(path) ? [path] : [];
  });
  let guards = 0;
  for (const file of walk("app/admin/murshida-manzil")) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /from ["']@\/lib\/auth\/session["']/);
    if (/requireMurshida(?:Access|Manager)\(\)/.test(source)) {
      assert.match(source, /from ["']@\/lib\/murshida-manzil\/accounts-session["']/);
      guards++;
    }
  }
  assert.ok(guards >= 12);
  const actions = readFileSync("app/admin/murshida-manzil/actions.ts", "utf8");
  assert.doesNotMatch(actions, /requireMurshidaAccess/);
  assert.ok((actions.match(/requireMurshidaManager\(\)/g) ?? []).length >= 16);
  assert.match(readFileSync("app/admin/murshida-manzil/[id]/rent-receipt/[operation]/page.tsx", "utf8"), /requireMurshidaManager\(\)/);
});
