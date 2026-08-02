import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(path, "utf8");

function relativeLuminance(hex: string) {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)!
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4,
    );

  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrastRatio(foreground: string, background: string) {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

test("theme text and semantic status pairs meet WCAG AA contrast", async () => {
  const css = await read("app/globals.css");
  const blocks = {
    light: css.match(/:root\s*\{([^}]*)\}/)?.[1] ?? "",
    dark: css.match(/html\[data-theme="dark"\]\s*\{([^}]*)\}/)?.[1] ?? "",
  };
  const value = (block: string, property: string) => {
    const match = block.match(new RegExp(`${property}:\\s*(#[0-9a-f]{6})`, "i"));
    assert.ok(match, `${property} must be a six-digit hex color`);
    return match[1];
  };

  for (const [theme, block] of Object.entries(blocks)) {
    for (const [name, foreground, background] of [
      ["foreground", "--foreground", "--background"],
      ["muted", "--muted-text", "--surface"],
      ["action", "--primary-foreground", "--primary"],
      ["error", "--error-text", "--error-surface"],
      ["success", "--success-text", "--success-surface"],
      ["warning", "--warning-text", "--warning-surface"],
      ["information", "--information-text", "--information-surface"],
    ]) {
      assert.ok(
        contrastRatio(value(block, foreground), value(block, background)) >= 4.5,
        `${theme} ${name} must be at least 4.5:1`,
      );
    }
  }
});

test("explicit theme CSS covers core, scoped experiences, catalogue, rich content, and chat", async () => {
  const css = await read("app/globals.css");

  assert.match(css, /@custom-variant dark \(&:where\(html\[data-theme="dark"\], html\[data-theme="dark"\] \*\)\);/);
  assert.match(css, /html\[data-theme="dark"\]\s*\{[\s\S]*?color-scheme:\s*dark/);
  assert.match(css, /html\[data-theme="dark"\] \.sen-dashboard-shell\s*\{/);
  assert.match(css, /html\[data-theme="dark"\] \.public-experience\s*\{/);
  assert.match(css, /html\[data-theme="dark"\] \.public-experience \.sen-catalogue-card\b/);
  assert.match(css, /html\[data-theme="dark"\] \.public-experience \.product-rich-content\b/);
  assert.match(css, /html\[data-theme="dark"\] \.public-experience \.sen-chat-panel\b/);
  assert.doesNotMatch(css, /@media\s*\(prefers-color-scheme:\s*dark\)/);
});

test("dark compatibility rules stay scoped and cover neutral and semantic utilities", async () => {
  const css = await read("app/globals.css");

  for (const scope of [".sen-dashboard-shell", ".public-experience"]) {
    assert.match(css, new RegExp(`html\\[data-theme="dark"\\] ${scope.replace(".", "\\.")} :where\\([^)]*\\.bg-white`));
    assert.match(css, new RegExp(`html\\[data-theme="dark"\\] ${scope.replace(".", "\\.")} :where\\([^)]*\\.text-slate-`));
    assert.match(css, new RegExp(`html\\[data-theme="dark"\\] ${scope.replace(".", "\\.")} :where\\([^)]*\\.bg-blue-`));
    assert.match(css, new RegExp(`html\\[data-theme="dark"\\] ${scope.replace(".", "\\.")} :where\\([^)]*\\.bg-emerald-`));
    assert.match(css, new RegExp(`html\\[data-theme="dark"\\] ${scope.replace(".", "\\.")} :where\\([^)]*\\.bg-amber-`));
    assert.match(css, new RegExp(`html\\[data-theme="dark"\\] ${scope.replace(".", "\\.")} :where\\([^)]*\\.bg-red-`));
  }
});

test("printable paper artifacts stay explicitly light and isolated", async () => {
  const css = await read("app/globals.css");

  for (const artifact of [
    ".cashbook-print-sheet",
    ".quotation-page",
    ".document-page",
    ".serial-label",
  ]) {
    const escaped = artifact.replace(".", "\\.");
    assert.match(css, new RegExp(`${escaped}\\s*\\{[^}]*color-scheme:\\s*light`));
    assert.match(css, new RegExp(`${escaped}\\s*\\{[^}]*background(?:-color)?:\\s*(?:#fff(?:fff)?|white)`));
    assert.match(css, new RegExp(`${escaped}\\s*\\{[^}]*color:\\s*#0f172a`));
  }

  assert.match(css, /\.sen-dashboard-shell :where\([^)]*:not\(\.cashbook-print-sheet\)/);
  assert.match(css, /\.public-experience :where\([^)]*:not\(\.quotation-page\)/);
  assert.match(css, /@media print\s*\{[\s\S]*?\.serial-label\s*\{[\s\S]*?break-inside:\s*avoid/);
});

test("broad dashboard dark rules exclude paper roots and every paper descendant", async () => {
  const css = await read("app/globals.css");
  const exclusion = [
    ".cashbook-print-sheet",
    ".quotation-page",
    ".document-page",
    ".serial-label",
  ].map((artifact) => `:not(${artifact}):not(${artifact} *)`).join("");
  const selectors = [
    ['html[data-theme="dark"] .sen-dashboard-content :where(section, article, form, details) > :where(h2, h3):first-child', ""],
    ['html[data-theme="dark"] .sen-dashboard-content :where(section, article, form, details) > div:first-child :where(h2, h3)', ""],
    ['html[data-theme="dark"] .sen-dashboard-content :where(.rounded-xl, .rounded-2xl).border', ""],
    ['html[data-theme="dark"] .sen-dashboard-content :where(input:not([type="checkbox"]):not([type="radio"]), select, textarea)', ""],
    ['html[data-theme="dark"] .sen-dashboard-content :where(input:not([type="checkbox"]):not([type="radio"]), select, textarea)', ":hover"],
    ['html[data-theme="dark"] .sen-dashboard-content table thead', ""],
    ['html[data-theme="dark"] .sen-dashboard-content table tbody tr', ""],
    ['html[data-theme="dark"] .sen-dashboard-content table tbody tr', ":nth-child(even)"],
    ['html[data-theme="dark"] .sen-dashboard-content table tbody tr', ":hover"],
  ] as const;

  for (const [selector, state] of selectors) {
    assert.ok(
      css.includes(`${selector}${exclusion}${state}`),
      `${selector}${state} must exclude all printable paper roots and descendants`,
    );
  }
});

test("dashboard utility remaps never recolor branded header or sidebar descendants", async () => {
  const css = await read("app/globals.css");
  const mappings = css
    .split(/\r?\n/)
    .filter((line) => line.startsWith('html[data-theme="dark"] .sen-dashboard-shell :where(.'));

  assert.ok(mappings.length >= 16, "expected the dashboard neutral and semantic compatibility mappings");
  for (const mapping of mappings) {
    assert.match(mapping, /:not\(\.sen-dashboard-header \*\)/);
    assert.match(mapping, /:not\(\.sen-dashboard-sidebar \*\)/);
  }
});

test("cyan, sky, and indigo utility pairs receive scoped dark compatibility", async () => {
  const css = await read("app/globals.css");

  for (const scope of [".sen-dashboard-shell", ".public-experience"]) {
    const escapedScope = scope.replace(".", "\\.");
    for (const hue of ["cyan", "sky", "indigo"]) {
      assert.match(css, new RegExp(`html\\[data-theme="dark"\\] ${escapedScope} :where\\([^\\n}]*\\.bg-${hue}-50`));
      assert.match(css, new RegExp(`html\\[data-theme="dark"\\] ${escapedScope} :where\\([^\\n}]*\\.text-${hue}-(?:700|800|900|950)`));
      assert.match(css, new RegExp(`html\\[data-theme="dark"\\] ${escapedScope} :where\\([^\\n}]*\\.border-${hue}-(?:100|200|300|700)`));
    }
  }

  const newHueMappings = css
    .split(/\r?\n/)
    .filter((line) => /\.(?:bg|text|border)-(?:cyan|sky|indigo)-/.test(line));
  for (const mapping of newHueMappings.filter((line) => line.includes(".sen-dashboard-shell :where("))) {
    assert.match(mapping, /:not\(\.cashbook-print-sheet \*\)/);
    assert.match(mapping, /:not\(\.sen-dashboard-header \*\)/);
    assert.match(mapping, /:not\(\.sen-dashboard-sidebar \*\)/);
  }
  for (const mapping of newHueMappings.filter((line) => line.includes(".public-experience :where("))) {
    assert.match(mapping, /:not\(\.quotation-page \*\)/);
    assert.match(mapping, /:not\(\.sen-header \*\)/);
    assert.match(mapping, /:not\(\.sen-hero \*\)/);
    assert.match(mapping, /:not\(\.sen-footer \*\)/);
  }
});

test("intentionally light password help controls meet AA contrast", async () => {
  const css = await read("app/globals.css");
  const panel = css.match(/html\[data-theme="dark"\] \.sen-password-help-panel\s*\{([^}]*)\}/)?.[1] ?? "";
  const foreground = panel.match(/color:\s*(#[0-9a-f]{6})/i)?.[1];
  const background = panel.match(/background(?:-color)?:\s*(#[0-9a-f]{6})/i)?.[1];

  assert.ok(foreground && background, "password help panel must use explicit hex paper colors");
  assert.ok(contrastRatio(foreground, background) >= 4.5, "password help panel text must meet WCAG AA");
});
