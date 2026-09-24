import assert from "node:assert/strict";
import test from "node:test";

async function loadConfig(vercel: string | undefined) {
  const previous = process.env.VERCEL;
  if (vercel === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = vercel;

  try {
    const configModule = await import(`../next.config.ts?vercel=${vercel ?? "offline"}-${Date.now()}-${Math.random()}`);
    return configModule.default;
  } finally {
    if (previous === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previous;
  }
}

test("offline builds keep standalone output", async () => {
  const config = await loadConfig(undefined);
  assert.equal(config.output, "standalone");
});

test("Vercel builds leave output to the platform adapter", async () => {
  const config = await loadConfig("1");
  assert.equal(config.output, undefined);
});
