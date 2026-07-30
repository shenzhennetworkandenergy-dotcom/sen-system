# Shared My Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give customers, employees, and administrators one responsive, section-based My Profile page with avatar, cover image, personal, contact, location, work, social, and emergency information.

**Architecture:** `/profile` is the canonical authenticated route and uses a small profile validation module plus server actions that always derive the target profile from the session. Existing customer profile behavior redirects to the canonical route, while role dashboards and headers link to the same page and render a signed avatar or fallback.

**Tech Stack:** Next.js 16 App Router and Server Actions, React 19, TypeScript, Supabase/PostgreSQL and private Storage, Node test runner.

## Global Constraints

- Profile information is private to the owner and authorized administrators.
- Login email remains read-only.
- Employee workplace assignment remains operationally separate.
- Uploaded images accept only validated JPG, PNG, or WebP files.
- Existing unrelated workspace changes must not be modified.

---

### Task 1: Profile data and validation

**Files:**
- Create: `lib/profile/validation.ts`
- Create: `tests/profile-validation.test.mts`
- Create: `supabase/migrations/202607300006_shared_profile_fields.sql`

**Interfaces:**
- Produces: `normalizeProfileInput(input)` and `normalizeSocialLinks(input)`
- Produces optional profile columns and private cover-image storage support

- [ ] Write failing tests for trimming, length limits, date, gender, pronouns, social-link allowlist, and emergency contact.
- [ ] Run the focused test and verify failure because the module is absent.
- [ ] Implement minimal pure normalization.
- [ ] Re-run the focused test and require zero failures.
- [ ] Add the additive migration with bounded optional fields and service-role access.

### Task 2: Shared profile actions

**Files:**
- Create: `app/profile/actions.ts`
- Modify: `app/account/profile/actions.ts`
- Test: `tests/profile-validation.test.mts`

**Interfaces:**
- Consumes: `normalizeProfileInput`
- Produces: `updateProfileSectionAction` and `updateProfileMediaAction`

- [ ] Add failing tests for section-specific payload shaping.
- [ ] Run and verify the expected failure.
- [ ] Implement owner-scoped actions, private media upload, old-media cleanup, auditing, revalidation, and safe redirects.
- [ ] Re-run focused tests.

### Task 3: Facebook-style profile UI

**Files:**
- Create: `app/profile/page.tsx`
- Create: `components/profile/ProfileHeader.tsx`
- Create: `components/profile/ProfileSections.tsx`
- Modify: `app/account/profile/page.tsx`

**Interfaces:**
- Consumes: current profile, signed media URLs, profile server actions
- Produces: responsive shared profile page and legacy redirect

- [ ] Build the social-style header and independent cards for About, Contact, Location, Work, Social links, and Emergency contact.
- [ ] Hide empty optional values behind Add information controls.
- [ ] Verify accessible labels, mobile stacking, notices, and media fallbacks.

### Task 4: Role navigation and avatar

**Files:**
- Modify: `components/dashboard/Shell.tsx`
- Modify: `components/layout/PublicHeader.tsx`
- Modify: `components/layout/MobileNavigation.tsx`
- Modify: `lib/constants/routes.ts`
- Modify: `lib/navigation/dashboard.ts`
- Modify: `app/account/page.tsx`

**Interfaces:**
- Produces: `/profile` navigation and small signed avatar for all authenticated roles

- [ ] Add the canonical route constant and role navigation entries.
- [ ] Replace person-link My Account copy with My Profile.
- [ ] Render signed avatar, emoji, or initials in authenticated headers.
- [ ] Preserve links to the broader customer account dashboard where they represent orders and account history.

### Task 5: Profile verification

**Files:**
- Modify: `package.json`

- [ ] Add `test:profile`.
- [ ] Run profile tests.
- [ ] Run lint and production build.
- [ ] Apply the local migration.
- [ ] Verify customer, employee, and administrator profile navigation in an authenticated browser.
