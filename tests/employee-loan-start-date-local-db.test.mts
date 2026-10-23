import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

test("isolated Docker: Admin date edits, payroll eligibility, immutable history and audit", { skip: process.env.SEN_EMPLOYEE_LOAN_LOCAL_TEST !== "1" }, () => {
  const container = "supabase_db_sen-system";
  const inspect = spawnSync("docker", ["inspect", container], { encoding: "utf8" });
  assert.equal(inspect.status, 0, "Expected isolated Docker backend is unavailable");
  const [identity] = JSON.parse(inspect.stdout);
  assert.equal(identity.Id, "f7ed0200b4a032ab63ad1ba5e3d9a7d51d9a45dbe972fb0ab12102ede33cab1c");
  assert.equal(identity.State.Running, true);
  assert.ok(identity.NetworkSettings.Ports["5432/tcp"].some((port: { HostPort: string }) => port.HostPort === "54322"));
  const sql = readFileSync(new URL("../supabase/tests/employee_loan_start_date_edit_v1.sql", import.meta.url), "utf8");
  const result = spawnSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-X", "-q", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8", timeout: 30000 });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stderr, /PASS: local database/);
});
