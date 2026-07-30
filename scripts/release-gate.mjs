import { spawnSync } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
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
  "test:crm",
  "test:variable-products",
  "test:favicon",
  "test:public-header",
  "test:admin-deletion",
  "test:business-categories",
  "test:chatbot-conversation",
  "test:production-database",
  "lint",
  "build",
];

for (const check of checks) {
  process.stdout.write(`\n=== ${check} ===\n`);
  const result = spawnSync(npm, ["run", check], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log(`\nRelease gate passed: ${checks.length} checks.`);
