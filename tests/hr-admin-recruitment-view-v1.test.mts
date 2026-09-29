import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const data = read("lib/hr/admin-recruitment.ts");
const list = read("app/admin/hr/recruitment/page.tsx");
const detail = read("app/admin/hr/recruitment/applications/[applicationId]/page.tsx");
const route = read("app/admin/hr/recruitment/documents/[documentId]/route.ts");
const nav = read("components/hr/HrAdminNavigation.tsx");
const migration = read("supabase/migrations/202609290001_hr_recruitment_admin_view_permission.sql");
const applicantData = read("lib/hr/recruitment-job-application-data.ts");

const checks: Array<[string, () => void]> = [
  ["uses existing permission architecture", () => assert.match(data, /requirePermission\(ADMIN_RECRUITMENT_PERMISSION\)/)],
  ["uses separate admin permission", () => assert.match(data, /hr\.manage_recruitment/)],
  ["employee applicant permission does not grant admin access", () => assert.doesNotMatch(data, /hr\.access_recruitment/)],
  ["authorized navigation is conditional", () => assert.match(nav, /mayViewRecruitment/)],
  ["unauthorized navigation is hidden", () => assert.match(nav, /label !== "Recruitment" \|\| mayViewRecruitment/)],
  ["list route is permission protected", () => assert.match(data, /getSubmittedRecruitmentApplications[\s\S]*requireAdminRecruitmentAccess/)],
  ["details route is permission protected", () => assert.match(data, /getSubmittedRecruitmentApplication[\s\S]*requireAdminRecruitmentAccess/)],
  ["document route is permission protected", () => assert.match(data, /getAdminRecruitmentDocument[\s\S]*requireAdminRecruitmentAccess/)],
  ["submitted list is status scoped", () => assert.match(data, /\.eq\("status", "SUBMITTED"\)/)],
  ["drafts are excluded", () => assert.doesNotMatch(list, /DRAFT/)],
  ["search includes application number", () => assert.match(data, /application_number\.ilike/)],
  ["search includes applicant", () => assert.match(data, /full_name\.ilike/)],
  ["search includes phone", () => assert.match(data, /phone\.ilike/)],
  ["search includes position", () => assert.match(data, /position_applied_for\.ilike/)],
  ["position filter exists", () => assert.match(data, /ilike\("position_applied_for"/)],
  ["from date filter exists", () => assert.match(data, /gte\("submitted_at"/)],
  ["to date filter exists", () => assert.match(data, /lte\("submitted_at"/)],
  ["newest first ordering", () => assert.match(data, /order\("submitted_at", \{ ascending: false \}\)/)],
  ["pagination is bounded", () => assert.match(data, /ADMIN_RECRUITMENT_PAGE_SIZE = 25/)],
  ["list renders required columns", () => ["Application No.","Applicant Name","Position Applied For","Phone","Submitted On","Status","Action"].forEach((value) => assert.match(list, new RegExp(value.replace(".", "\\."))))],
  ["details header renders", () => assert.match(detail, /Recruitment Application/)],
  ["personal information renders", () => assert.match(detail, /Personal Information/)],
  ["spouse is conditional", () => assert.match(detail, /marital_status === "Married"/)],
  ["nid renders", () => assert.match(detail, /NID Number/)],
  ["passport absence is safe", () => assert.match(detail, /Not Provided/)],
  ["passport data renders conditionally", () => assert.match(detail, /a\.passport_number \?/)],
  ["education repeatables render", () => assert.match(detail, /state\.education\.map/)],
  ["education certificates preserve relation", () => assert.match(detail, /education_certificate", row\.id/)],
  ["no experience declaration renders", () => assert.match(detail, /Applicant declared no previous work experience/)],
  ["experience repeatables render", () => assert.match(detail, /state\.experience\.map/)],
  ["experience certificate optional", () => assert.match(detail, /Experience Certificate: Not Provided/)],
  ["qualification repeatables render", () => assert.match(detail, /state\.qualifications\.map/)],
  ["qualification certificate optional", () => assert.match(detail, /qualification_certificate/)],
  ["zero skills renders", () => assert.match(detail, /No skills added/)],
  ["skills render when present", () => assert.match(detail, /state\.skills\.map/)],
  ["document center renders", () => assert.match(detail, /Document Center/)],
  ["secure view is available", () => assert.match(detail, />View</)],
  ["secure download is available", () => assert.match(detail, />Download</)],
  ["document URLs are server mediated", () => assert.match(data, /\/admin\/hr\/recruitment\/documents/)],
  ["signed URLs are short lived", () => assert.match(route, /createSignedUrl\(document\.storage_path, 60/)],
  ["bucket is not made public", () => assert.doesNotMatch(route + migration, /public\s*[:=]\s*true/i)],
  ["viewer exposes no edit action", () => assert.doesNotMatch(detail, /Edit Application|action=/)],
  ["viewer exposes no delete action", () => assert.doesNotMatch(detail + data, /Delete Application|\.delete\(/)],
  ["viewer exposes no status mutation", () => assert.doesNotMatch(detail + data, /Approve|Reject|reviewed_at|review_status/)],
  ["applicant data access remains owner scoped", () => assert.match(applicantData, /\.eq\("profile_id",context\.profile\.id\)/)],
  ["migration only registers permission", () => { assert.match(migration, /insert into public\.permissions/); assert.doesNotMatch(migration, /alter table|create table|review_status/); }],
];

for (const [name, check] of checks) test(name, check);
