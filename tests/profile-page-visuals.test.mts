import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(path, "utf8");

test("shared profile sections use compact tones and an intentional default-open policy", async () => {
  const profile = await read("app/profile/page.tsx");
  const sectionTags = [...profile.matchAll(/<Section\b[^>]*>/g)].map((match) => match[0]);

  const actual = sectionTags.map((tag) => ({
    title: tag.match(/title="([^"]+)"/)?.[1] ?? "",
    tone: tag.match(/tone="([^"]+)"/)?.[1] ?? "",
    defaultOpen: /\bdefaultOpen\b/.test(tag),
  }));

  assert.deepEqual(actual, [
    { title: "About", tone: "blue", defaultOpen: true },
    { title: "Contact", tone: "cyan", defaultOpen: true },
    { title: "Location", tone: "emerald", defaultOpen: false },
    { title: "Work", tone: "violet", defaultOpen: false },
    { title: "Social links", tone: "rose", defaultOpen: false },
    { title: "Emergency contact", tone: "amber", defaultOpen: false },
  ]);

  assert.match(profile, /data-profile-tone=\{tone\}/);
  assert.match(profile, /open=\{defaultOpen\}/);
  assert.match(profile, /sen-profile-section-chevron/);
});

test("compact profile keeps every existing mutation and field contract", async () => {
  const profile = await read("app/profile/page.tsx");

  assert.match(profile, /sen-profile-page/);
  assert.match(profile, /sen-profile-hero/);
  assert.match(profile, /sen-profile-media-card/);
  assert.match(profile, /sen-profile-field/);

  for (const media of ["avatar", "cover"]) {
    assert.ok(profile.includes(`updateProfileMediaAction.bind(null,"${media}")`));
  }
  for (const section of ["about", "contact", "location", "work", "social", "emergency"]) {
    assert.ok(profile.includes(`updateProfileSectionAction.bind(null,"${section}")`));
  }
  for (const field of ["full_name", "phone", "address_line", "company_name", "linkedin", "emergency_contact_phone"]) {
    assert.match(profile, new RegExp(`name="${field}"`));
  }
});

test("profile media remains visible and emoji avatars remain selectable", async () => {
  const [profile, actions, css] = await Promise.all([
    read("app/profile/page.tsx"),
    read("app/profile/actions.ts"),
    read("app/globals.css"),
  ]);

  assert.match(profile, /alt="Profile cover"/);
  assert.match(profile, /alt=\{`\$\{data\.full_name \?\? "User"\} profile`\}/);
  assert.match(profile, /name="avatar_emoji"/);
  assert.match(profile, /className="sen-profile-emoji-option"/);
  assert.match(profile, /className="sen-profile-avatar-fallback"/);
  assert.match(actions, /avatar_kind:\s*storagePath \? "upload" : "emoji"/);
  assert.match(actions, /avatar_path:\s*storagePath/);
  assert.match(actions, /avatar_emoji:\s*avatarEmojis\.has\(emoji\)/);
  assert.match(css, /\.sen-profile-emoji-option:has\(input:checked\)/);
  assert.match(css, /\.sen-profile-avatar-fallback/);
});

test("profile styling is scoped, responsive, theme-aware, and motion-safe", async () => {
  const css = await read("app/globals.css");

  for (const hook of [
    ".sen-profile-page",
    ".sen-profile-hero",
    ".sen-profile-media-card",
    ".sen-profile-section",
    ".sen-profile-field",
    ".sen-profile-save-button",
  ]) {
    assert.ok(css.includes(hook), `Missing profile style hook ${hook}`);
  }

  for (const tone of ["blue", "cyan", "emerald", "violet", "rose", "amber"]) {
    assert.match(css, new RegExp(`\\.sen-profile-section\\[data-profile-tone="${tone}"\\]`));
  }

  assert.match(css, /html\[data-theme="dark"\] \.sen-profile-page/);
  assert.match(css, /@media \(max-width:\s*640px\)[\s\S]*\.sen-profile-/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.sen-profile-section::before\s*\{\s*animation:\s*none/);
});
