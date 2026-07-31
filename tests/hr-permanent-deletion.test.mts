import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { parsePermanentHrDeletion } from "../lib/hr/permanent-deletion.ts";

const attendanceId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";

test("permanent HR deletion requires the global mode and valid selected records", () => {
  assert.throws(
    () => parsePermanentHrDeletion(false, [attendanceId], 100),
    /Permanent Deletion Mode is disabled/,
  );
  assert.throws(
    () => parsePermanentHrDeletion(true, [], 100),
    /Select at least one record/,
  );
  assert.throws(
    () => parsePermanentHrDeletion(true, ["not-a-uuid"], 100),
    /invalid record/,
  );
  assert.deepEqual(
    parsePermanentHrDeletion(
      true,
      [attendanceId, attendanceId, secondId],
      100,
    ),
    [attendanceId, secondId],
  );
});

test("permanent HR deletion enforces a positive selection limit", () => {
  assert.throws(
    () => parsePermanentHrDeletion(true, [attendanceId], 0),
    /selection limit/,
  );
  assert.throws(
    () =>
      parsePermanentHrDeletion(
        true,
        Array.from({ length: 101 }, (_, index) =>
          `${String(index).padStart(8, "0")}-1111-4111-8111-111111111111`,
        ),
        100,
      ),
    /up to 100/,
  );
});

test("attendance deletion is database guarded and preserves correction history", async () => {
  const migration = await readFile(
    "supabase/migrations/202607310006_hr_admin_permanent_deletion.sql",
    "utf8",
  ).catch(() => "");
  assert.match(migration, /admin_delete_hr_attendance/);
  assert.match(migration, /permanent_deletion_enabled/);
  assert.match(
    migration,
    /update public\.hr_attendance_correction_requests[\s\S]+attendance_id = null/i,
  );
  assert.match(migration, /delete from public\.hr_attendance/i);
});

test("employee document deletion uses a durable storage job and transactional audit", async () => {
  const migration = await readFile(
    "supabase/migrations/202607310008_hr_employee_document_deletion_jobs.sql",
    "utf8",
  ).catch(() => "");
  assert.match(migration, /hr_employee_document_deletion_jobs/);
  assert.match(migration, /admin_prepare_hr_employee_document_deletion/);
  assert.match(migration, /admin_finalize_hr_employee_document_deletion/);
  assert.match(migration, /admin_fail_hr_employee_document_deletion/);
  assert.match(migration, /permanent_deletion_enabled/);
  assert.match(migration, /delete from public\.hr_employee_documents/i);
  assert.match(migration, /hr\.documents_deleted_permanently/);
  assert.match(migration, /'document_ids', to_jsonb\(job\.document_ids\)/);
});

test("admin HR pages wire selected attendance and document deletion controls", async () => {
  const [actions, attendancePage, employeePage] = await Promise.all([
    readFile("app/admin/hr/hr-actions.ts", "utf8"),
    readFile("app/admin/hr/attendance/page.tsx", "utf8"),
    readFile("app/admin/hr/employees/[id]/page.tsx", "utf8"),
  ]);
  assert.match(actions, /deleteAttendanceAction/);
  assert.match(actions, /deleteEmployeeDocumentsAction/);
  assert.match(actions, /getDeletionMode/);
  assert.match(actions, /admin_prepare_hr_employee_document_deletion/);
  assert.match(actions, /admin_finalize_hr_employee_document_deletion/);
  assert.match(actions, /admin_fail_hr_employee_document_deletion/);
  assert.match(actions, /storage\.from\("hr-documents"\)\.remove/);
  assert.match(actions, /remove\(storagePaths\)/);
  assert.match(attendancePage, /name="attendance_ids"/);
  assert.match(attendancePage, /Delete selected attendance/);
  assert.match(employeePage, /name="document_ids"/);
  assert.match(employeePage, /Delete selected documents/);
});
