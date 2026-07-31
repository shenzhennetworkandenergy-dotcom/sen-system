import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const requiredPaths = [
  "app",
  "app/api",
  "components",
  "config",
  "lib",
  "public/brand/sen-logo.svg",
  "scripts",
  "supabase/config.toml",
  "supabase/migrations",
  "types",
  ".env.example",
  "docs/DEPLOYMENT.md",
  "next.config.ts",
  "package-lock.json",
  "package.json",
  "README.md",
  "tsconfig.json",
];

const requiredEnvironmentNames = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CHATBOT_HASH_SALT",
];

const optionalEnvironmentNames = [
  "SUPABASE_SECRET_KEY",
  "UDDOKTAPAY_BASE_URL",
  "UDDOKTAPAY_API_KEY",
  "UDDOKTAPAY_WEBHOOK_SECRET",
  "EPS_BASE_URL",
  "EPS_API_KEY",
  "EPS_WEBHOOK_SECRET",
  "CHATBOT_TEST_BASE_URL",
];

const failures = [];

for (const path of requiredPaths) {
  if (!existsSync(join(root, path))) failures.push(`Missing required path: ${path}`);
}

const envPath = join(root, ".env.example");
if (existsSync(envPath)) {
  const envText = readFileSync(envPath, "utf8");
  for (const name of [...requiredEnvironmentNames, ...optionalEnvironmentNames]) {
    if (!new RegExp(`^${name}=`, "m").test(envText)) {
      failures.push(`.env.example does not document ${name}`);
    }
  }

  const unsafeAssignments = envText
    .split(/\r?\n/)
    .filter((line) => /^[A-Z0-9_]+=.+/.test(line))
    .filter((line) => !/=(https?:\/\/(127\.0\.0\.1|localhost)|change-me|optional|)$/.test(line));
  if (unsafeAssignments.length) {
    failures.push(".env.example contains non-placeholder values");
  }
}

const readmePath = join(root, "README.md");
if (existsSync(readmePath)) {
  const readme = readFileSync(readmePath, "utf8");
  for (const section of ["SEN System", "Production deployment", "Database migrations"]) {
    if (!readme.includes(section)) failures.push(`README is missing "${section}"`);
  }
}

const migrations = existsSync(join(root, "supabase/migrations"))
  ? readFileSync(join(root, "supabase/migrations/202607300010_dynamic_business_category_api_grants.sql"), "utf8")
  : "";
if (!migrations.includes("business_categories")) {
  failures.push("Dynamic business-category API migration is missing");
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log(
  `Production structure verified: ${requiredPaths.length} required paths and ${
    requiredEnvironmentNames.length + optionalEnvironmentNames.length
  } environment names.`,
);
