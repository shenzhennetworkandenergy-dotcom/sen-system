import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  RECRUITMENT_TERMS_TOTAL_STEPS,
  RECRUITMENT_TERMS_VERSION,
  recruitmentReadingSeconds,
  recruitmentTerms,
  recruitmentTermsNotice,
} from "../lib/hr/recruitment-terms.ts";

test("Recruitment Lite V2 exposes exactly nine approved subjects in order", () => {
  assert.equal(RECRUITMENT_TERMS_VERSION, "SEN-RECRUITMENT-LITE-V2");
  assert.equal(RECRUITMENT_TERMS_TOTAL_STEPS, 9);
  assert.equal(recruitmentTerms.length, 9);
  assert.deepEqual(
    recruitmentTerms.map((term) => term.title),
    [
      "ধাপ ১ — আবেদনকারীর তথ্যের সত্যতা ও ঘোষণা",
      "ধাপ ২ — কাগজপত্র প্রদান ও যাচাইয়ের সম্মতি",
      "ধাপ ৩ — নিয়োগ, সাক্ষাৎকার ও নির্বাচন প্রক্রিয়া",
      "ধাপ ৪ — প্রবেশনকাল ও কর্মক্ষেত্রের দায়িত্ব",
      "ধাপ ৫ — ছুটি, উপস্থিতি, দেরি, অনুপস্থিতি ও বেতন সমন্বয়",
      "ধাপ ৬ — কর্মক্ষেত্রে সহকর্মীদের সঙ্গে আচরণ ও পেশাগত সম্পর্ক",
      "ধাপ ৭ — কর্মসময়, দায়িত্ব ও অর্পিত সময়ের আমানত রক্ষা",
      "ধাপ ৮ — কোম্পানির দায়িত্ব, আমানত, সম্পদ ও গোপনীয়তা রক্ষা",
      "ধাপ ৯ — ব্যক্তিগত তথ্য, গোপনীয়তা ও চূড়ান্ত ঘোষণা",
    ],
  );
});

test("embedded Terms match the approved content fingerprint, including ইনশাআল্লাহ", () => {
  const sourceFile = readFileSync("lib/hr/recruitment-terms.ts", "utf8");
  const sourceLiteral = sourceFile.match(/const recruitmentTermsSource = (.*);\r?\n/)?.[1];
  assert.ok(sourceLiteral);
  const approvedTerms = JSON.parse(sourceLiteral);
  assert.equal(
    createHash("sha256").update(approvedTerms, "utf8").digest("hex"),
    "8cfcc1c03975080ccf91b6b77eb3f58ee28302f03bc09b6ebab7cccbfaff88d4",
  );
  const displayed = [
    recruitmentTermsNotice,
    ...recruitmentTerms.flatMap((term) => [term.title, term.body, ...term.consents]),
  ].join("\n");

  assert.equal((approvedTerms.match(/ইনশাআল্লাহ/g) ?? []).length, 49);
  assert.equal((displayed.match(/ইনশাআল্লাহ/g) ?? []).length, 49);
  assert.match(recruitmentTerms[8].consents[0], /ইনশাআল্লাহ/);
});

test("authoritative policies, ethical distinction, Arabic and references remain visible", () => {
  assert.match(recruitmentTermsNotice, /Company Policy-কে সরাসরি শরয়ি বিধান হিসেবে দাবি করা হচ্ছে না/);
  assert.match(recruitmentTerms[4].body, /প্রতি সপ্তাহে ১ \(এক\) দিন সাপ্তাহিক ছুটি/);
  assert.match(recruitmentTerms[4].body, /কুরবানির ঈদ উপলক্ষে ৮ \(আট\) দিন ছুটি/);
  assert.match(recruitmentTerms[4].body, /ঈদুল ফিতর উপলক্ষে ৫ দিন/);
  assert.match(recruitmentTerms[4].body, /বছরে ৭ \(সাত\) দিন Casual Leave/);
  assert.match(recruitmentTerms[5].body, /لَا يَسْخَرْ قَوْمٌ مِنْ قَوْمٍ/);
  assert.match(recruitmentTerms[5].body, /সহিহ আল-বুখারি, হাদিস ১০/);
  assert.match(recruitmentTerms[6].body, /إِنَّ اللَّهَ يَأْمُرُكُمْ أَنْ تُؤَدُّوا الْأَمَانَاتِ/);
  assert.match(recruitmentTerms[7].body, /সূরা আল-হুজুরাত, সূরা ৪৯, আয়াত ১২/);
  assert.equal(recruitmentTerms[8].consents.length, 3);
  assert.match(recruitmentTerms[8].consents[0], /ধাপ ১ থেকে ধাপ ৯/);
});

test("reading duration is deterministic, content-based and bounded", () => {
  const first = recruitmentTerms.map((_, index) => recruitmentReadingSeconds(index + 1));
  const second = recruitmentTerms.map((_, index) => recruitmentReadingSeconds(index + 1));
  assert.deepEqual(first, second);
  assert.ok(first.every((seconds) => seconds >= 15 && seconds <= 90));
});

test("server acceptance enforces timer, current step and every explicit consent", () => {
  const actions = readFileSync("app/employee/hr/recruitment/actions.ts", "utf8");
  assert.match(actions, /term\.consents\.every/);
  assert.match(actions, /Date\.now\(\) < earliestAcceptance/);
  assert.match(actions, /process\.current_step !== requestedStep/);
  assert.match(actions, /RECRUITMENT_TERMS_TOTAL_STEPS/);
  assert.match(actions, /ignoreDuplicates: true/);
});

test("employee UI blocks pre-timer consent and exposes only the approved completion hook", () => {
  const step = readFileSync("components/hr/RecruitmentTermsStep.tsx", "utf8");
  const page = readFileSync("app/employee/hr/recruitment/page.tsx", "utf8");
  assert.match(step, /disabled=\{!timerComplete \|\| pending\}/);
  assert.match(step, /const allConsented = consented\.every\(Boolean\)/);
  assert.match(step, /disabled=\{!timerComplete \|\| !allConsented \|\| pending\}/);
  assert.match(page, /9\/9 Completed/);
  assert.match(page, /Continue to Job Application/);
  assert.match(page, /routes\.employeeHrRecruitmentApplication/);
  assert.doesNotMatch(page, /Admin Recruitment/);
});

test("Recruitment V2 migration permits nine steps without changing persistence", () => {
  const migration = readFileSync(
    "supabase/migrations/202609270001_hr_recruitment_lite_v2_steps.sql",
    "utf8",
  );
  assert.match(migration, /current_step between 1 and 9/);
  assert.match(migration, /step_number between 1 and 9/);
  assert.doesNotMatch(migration, /create table/i);
});
