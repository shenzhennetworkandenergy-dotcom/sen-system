import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import * as nodeModule from "node:module";
import { resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

type ResolveHook = (
  specifier: string,
  context: unknown,
  nextResolve: (specifier: string, context: unknown) => unknown,
) => unknown;

const registerHooks = (nodeModule as unknown as {
  registerHooks(hooks: { resolve: ResolveHook }): void;
}).registerHooks;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return {
        shortCircuit: true,
        url: "data:text/javascript,export {};",
      };
    }

    if (specifier.startsWith("@/")) {
      const target = resolve(process.cwd(), specifier.slice(2));
      const candidate = [target, `${target}.ts`, `${target}.tsx`].find(existsSync);
      if (!candidate) throw new Error(`Unable to resolve test import: ${specifier}`);
      return {
        shortCircuit: true,
        url: pathToFileURL(candidate).href,
      };
    }

    return nextResolve(specifier, context);
  },
});

const databaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const hasLocalDatabase =
  /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(databaseUrl) &&
  Boolean(process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY);

test("purchase detail loader targets the deployed carrier status schema", () => {
  const source = readFileSync(resolve(process.cwd(), "lib/purchasing/data.ts"), "utf8");
  assert.match(
    source,
    /from\("purchase_carriers"\)\.select\("id,name"\)\.eq\("status",\s*"active"\)/,
  );
  assert.doesNotMatch(source, /purchase_carriers[\s\S]{0,160}\.eq\("is_active"/);
});

test(
  "purchase detail loader executes against the local status-based carrier schema",
  { skip: !hasLocalDatabase },
  async () => {
    const { getPurchaseOrder } = await import("../lib/purchasing/data.ts");
    const result = await getPurchaseOrder("00000000-0000-4000-8000-000000000000");
    assert.equal(result, null);
  },
);
