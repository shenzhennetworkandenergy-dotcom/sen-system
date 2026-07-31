import { spawnSync } from "node:child_process";

const npmCli = process.env.npm_execpath;
if (!npmCli) {
  throw new Error("Run the release gate through `npm run test:release`.");
}
const checks = [
  "test:production-structure",
  "test:production-audit",
  "test:phase3b",
  "test:inventory",
  "test:inventory-phase1",
  "test:inventory-phase2",
  "test:inventory-phase3",
  "test:inventory-admin-controls",
  "test:sales",
  "test:purchasing",
  "test:supplier-categories",
  "test:accounting-hr",
  "test:hr-management",
  "test:hr-attendance-enhancements",
  "test:currency-inputs",
  "test:offline-permissions",
  "test:crm",
  "test:variable-products",
  "test:favicon",
  "test:public-header",
  "test:admin-deletion",
  "test:business-categories",
  "test:product-media-upload",
  "test:sale-product-search",
  "test:quotation-document",
  "test:chatbot",
  "test:chatbot-conversation",
  "test:standalone",
  "test:production-database",
  "lint",
  "build",
];

for (const check of checks) {
  process.stdout.write(`\n=== ${check} ===\n`);
  const result = spawnSync(process.execPath, [npmCli, "run", check], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log(`\nRelease gate passed: ${checks.length} checks.`);
