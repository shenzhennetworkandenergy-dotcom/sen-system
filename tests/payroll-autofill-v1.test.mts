import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";

const migration = new URL("../supabase/migrations/202610240001_hr_payroll_autofill_v1.sql", import.meta.url);
test("effective date, reservation and atomic payroll boundaries are forward-only", () => {
  const sql = readFileSync(migration, "utf8");
  assert.match(sql, /add column payment_effective_date date/);
  assert.match(sql, /payroll_active_installment_reservation/);
  assert.match(sql, /save_hr_payroll_draft_v1/);
  assert.match(sql, /cancel_hr_payroll_v1/);
  assert.doesNotMatch(sql, /create table|disable trigger|disable row level security/i);
  assert.doesNotMatch(sql, /update public\.hr_payroll_records set payment_effective_date/);
});

test("approval carries a snapshot version so a changed draft cannot be approved unseen", () => {
  const page = readFileSync(new URL("../app/admin/hr/payroll/page.tsx", import.meta.url), "utf8");
  const actions = readFileSync(new URL("../app/admin/hr/payroll/payroll-actions.ts", import.meta.url), "utf8");
  assert.match(page, /name="expected_updated_at" value=\{row.updated_at\}/);
  assert.match(actions, /expected_updated_at: field\(form, "expected_updated_at"\)/);
});

test("isolated Docker: concurrent overlapping drafts and installment reservations serialize", { skip: process.env.SEN_PAYROLL_CONCURRENCY_TEST !== "1", timeout: 30000 }, async () => {
  const info = spawnSync("docker", ["inspect", "supabase_db_sen-system"], { encoding: "utf8" });
  assert.equal(info.status, 0);
  assert.equal(JSON.parse(info.stdout)[0].Id, "f7ed0200b4a032ab63ad1ba5e3d9a7d51d9a45dbe972fb0ab12102ede33cab1c");
  const args = ["exec", "-i", "supabase_db_sen-system", "psql", "-U", "postgres", "-d", "postgres", "-X", "-At", "-q", "-v", "ON_ERROR_STOP=1"];
  const sql = (statement: string) => spawnSync("docker", args, { input: statement, encoding: "utf8", timeout: 15000 });
  const fixture = sql("select p.id||'|'||h.id from public.profiles p join public.hr_employee_records h on h.profile_id=p.id where p.email='admin.local@sen.test' and p.role='admin' and h.job_title='SYNTHETIC LOCAL PAYROLL TEST';");
  assert.equal(fixture.status, 0);
  const [admin, employee] = fixture.stdout.trim().split("|");
  assert.match(admin ?? "", /^[0-9a-f-]{36}$/);
  assert.match(employee ?? "", /^[0-9a-f-]{36}$/);
  const draft = (start: string, end: string) => `public.save_hr_payroll_draft_v1('${admin}','${employee}','${start}','${end}',30000,0,0,0,'BDT','2038-02-01',true,'SYNTHETIC PAYROLL CONCURRENCY V1')`;
  const session = (input: string, onOutput?: (output: string) => void) => {
    const child = spawn("docker", args, { windowsHide: true });
    let out = ""; let err = "";
    child.stdout.on("data", data => { out += String(data); onOutput?.(out); });
    child.stderr.on("data", data => { err += String(data); });
    const done = new Promise<{ code: number | null; out: string; err: string }>((resolve, reject) => {
      child.on("error", reject); child.on("close", code => resolve({ code, out, err }));
    });
    child.stdin.end(input); return done;
  };
  try {
    for (const overlapping of [true, false]) {
      let ready!: () => void;
      const locked = new Promise<void>(resolve => { ready = resolve; });
      const first = session(`begin; select ${draft("2038-01-01", "2038-01-31")};\n\\echo LOCK_HELD\nselect pg_sleep(1.5); commit;`, out => { if (out.includes("LOCK_HELD")) ready(); });
      await Promise.race([locked, first.then(result => { if (result.code !== 0) throw new Error(result.err); })]);
      const second = session(`select ${draft(overlapping ? "2038-01-15" : "2038-02-01", overlapping ? "2038-02-15" : "2038-02-28")};`);
      const [a, b] = await Promise.all([first, second]);
      assert.equal(a.code, 0, a.err);
      if (overlapping) { assert.notEqual(b.code, 0); assert.match(b.err, /overlap/); }
      else assert.equal(b.code, 0, b.err);
      const invariant = sql(`select count(*)=0 from (select installment_id from public.payroll_receivable_deductions where status in ('draft','approved') group by installment_id having count(*)>1) x;`);
      assert.equal(invariant.status, 0); assert.equal(invariant.stdout.trim(), "t");
      const cleanup = sql(`select public.cancel_hr_payroll_v1('${admin}',id) from public.hr_payroll_records where employee_record_id='${employee}' and notes='SYNTHETIC PAYROLL CONCURRENCY V1' and status in ('draft','approved');`);
      assert.equal(cleanup.status, 0, cleanup.stderr);
    }
  } finally {
    const cleanup = sql(`select public.cancel_hr_payroll_v1('${admin}',id) from public.hr_payroll_records where employee_record_id='${employee}' and notes='SYNTHETIC PAYROLL CONCURRENCY V1' and status in ('draft','approved');`);
    assert.equal(cleanup.status, 0, cleanup.stderr);
  }
});

test("isolated Docker: payroll autofill, effective date, reservations and posting invariants", { skip: process.env.SEN_PAYROLL_LOCAL_TEST !== "1" }, () => {
  const inspect = spawnSync("docker", ["inspect", "supabase_db_sen-system"], { encoding: "utf8" });
  assert.equal(inspect.status, 0);
  const [db] = JSON.parse(inspect.stdout);
  assert.equal(db.Id, "f7ed0200b4a032ab63ad1ba5e3d9a7d51d9a45dbe972fb0ab12102ede33cab1c");
  assert.equal(db.State.Running, true);
  assert.ok(db.NetworkSettings.Ports["5432/tcp"].some((p: { HostPort: string }) => p.HostPort === "54322"));
  const result = spawnSync("docker", ["exec", "-i", "supabase_db_sen-system", "psql", "-U", "postgres", "-d", "postgres", "-X", "-q", "-v", "ON_ERROR_STOP=1"], {
    input: readFileSync(new URL("../supabase/tests/hr_payroll_autofill_v1.sql", import.meta.url), "utf8"), encoding: "utf8", timeout: 60000,
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stderr, /PASS: payroll/);
});
