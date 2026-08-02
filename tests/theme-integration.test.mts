import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(path, "utf8");
const readOptional = async (path: string) => {
  try {
    return await read(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return "";
    }
    throw error;
  }
};

test("root layout bootstraps a validated appearance preference before paint", async () => {
  const layout = await read("app/layout.tsx");

  assert.match(layout, /<html[^>]*data-theme="light"[^>]*data-theme-mode="auto"[^>]*suppressHydrationWarning/);
  assert.match(layout, /<head>[\s\S]*<script/);
  assert.match(layout, /localStorage/);
  assert.match(layout, /sen-theme-mode/);
  assert.match(layout, /matchMedia\("\(prefers-color-scheme: dark\)"\)/);
  assert.match(layout, /dataset\.themeMode/);
  assert.match(layout, /dataset\.theme/);
  assert.match(layout, /style\.colorScheme/);
});

test("root layout mounts theme synchronization for routes without appearance selectors", async () => {
  const [layout, login, register, forgotPassword] = await Promise.all([
    read("app/layout.tsx"),
    read("app/login/page.tsx"),
    read("app/register/page.tsx"),
    read("app/forgot-password/page.tsx"),
  ]);

  assert.match(layout, /import \{ ThemeSynchronizer \} from "@\/components\/ui\/ThemeSynchronizer"/);
  assert.match(layout, /<body[^>]*>[\s\S]*<ThemeSynchronizer\s*\/>/);
  assert.doesNotMatch(layout, /^"use client"/);

  for (const authPage of [login, register, forgotPassword]) {
    assert.doesNotMatch(authPage, /ThemeSelector/);
  }
});

test("headless theme synchronizer owns cross-tab and automatic OS updates", async () => {
  const synchronizer = await readOptional("components/ui/ThemeSynchronizer.tsx");

  assert.match(synchronizer, /^"use client"/);
  assert.match(synchronizer, /useEffect/);
  assert.match(synchronizer, /window\.addEventListener\("storage", handleStorage\)/);
  assert.match(synchronizer, /window\.removeEventListener\("storage", handleStorage\)/);
  assert.match(synchronizer, /mediaQuery\.addEventListener\("change", handleSystemThemeChange\)/);
  assert.match(synchronizer, /mediaQuery\.removeEventListener\("change", handleSystemThemeChange\)/);
  assert.match(synchronizer, /event\.key === THEME_STORAGE_KEY/);
  assert.match(synchronizer, /applyTheme\(parseThemeMode\(event\.newValue\), false\)/);
  assert.match(synchronizer, /getThemeMode\(\) !== "auto"/);
  assert.match(synchronizer, /applyTheme\("auto", false\)/);
  assert.match(synchronizer, /return null/);
});

test("visible appearance selectors share the global store while headers stay server-rendered", async () => {
  const [selector, store, header, mobile, shell, css] = await Promise.all([
    read("components/ui/ThemeSelector.tsx"),
    readOptional("components/ui/theme-store.ts"),
    read("components/layout/PublicHeader.tsx"),
    read("components/layout/MobileNavigation.tsx"),
    read("components/dashboard/Shell.tsx"),
    read("app/globals.css"),
  ]);

  assert.match(selector, /^"use client"/);
  assert.match(selector, /useSyncExternalStore/);
  assert.match(selector, /<label/);
  assert.match(selector, /<select/);
  assert.match(selector, /Auto/);
  assert.match(selector, /Light/);
  assert.match(selector, /Dark/);
  assert.match(selector, /from "@\/components\/ui\/theme-store"/);
  assert.doesNotMatch(selector, /addEventListener\("storage"/);
  assert.doesNotMatch(selector, /addEventListener\("change"/);
  assert.match(selector, /compact/);
  assert.match(selector, /full/);
  assert.match(store, /root\.dataset\.themeMode = mode/);
  assert.match(store, /root\.dataset\.theme = resolved/);
  assert.match(store, /root\.style\.colorScheme = resolved/);
  assert.match(store, /window\.localStorage\.setItem\(THEME_STORAGE_KEY, mode\)/);
  assert.match(store, /dispatchEvent\(new CustomEvent\(THEME_CHANGE_EVENT/);
  assert.match(store, /addEventListener\(THEME_CHANGE_EVENT, handleThemeChange\)/);
  assert.match(header, /ThemeSelector/);
  assert.match(mobile, /ThemeSelector/);
  assert.match(shell, /ThemeSelector/);
  assert.doesNotMatch(header, /^"use client"/);
  assert.doesNotMatch(shell, /^"use client"/);
  assert.match(css, /color-scheme: light/);
});

test("resolved theme selectors override the operating system without global transitions", async () => {
  const css = await read("app/globals.css");

  assert.match(css, /@custom-variant dark/);
  assert.match(css, /html\[data-theme="dark"\]/);
  assert.doesNotMatch(css, /@media\s*\(prefers-color-scheme:\s*dark\)/);
  assert.doesNotMatch(css, /(?:html|body|\*)\s*\{[^}]*transition:\s*(?:all|background|color)/);
});

test("appearance preference animates only its decorative mode glyph", async () => {
  const [selector, css] = await Promise.all([
    read("components/ui/ThemeSelector.tsx"),
    read("app/globals.css"),
  ]);

  assert.match(selector, /themeModeGlyph\(mode\)/);
  assert.match(selector, /key=\{mode\}/);
  assert.match(selector, /data-theme-mode=\{mode\}/);
  assert.match(selector, /sen-theme-mode-icon/);
  assert.match(css, /@keyframes sen-theme-mode-pop/);

  const iconRule = css.match(/\.sen-theme-mode-icon\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(iconRule, /animation:\s*sen-theme-mode-pop\s+[^;]*\b1\b/);
  assert.match(iconRule, /pointer-events:\s*none/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.sen-theme-mode-icon\s*\{\s*animation:\s*none/);
  assert.doesNotMatch(css, /(?:html|body|\*)\s*\{[^}]*transition:\s*(?:all|background|color)/);
});

test("catalogue dark tokens apply when public and catalogue classes share the page root", async () => {
  const [css, listing, detail] = await Promise.all([
    read("app/globals.css"),
    read("app/products/page.tsx"),
    read("app/products/[slug]/page.tsx"),
  ]);

  for (const page of [listing, detail]) {
    assert.match(page, /className="public-experience catalogue-theme catalogue-theme-dynamic"/);
  }
  assert.match(css, /html\[data-theme="dark"\] \.public-experience\.catalogue-theme\b/);
  assert.match(css, /html\[data-theme="dark"\] \.public-experience\.catalogue-theme-dynamic\b/);
});

test("cart and quotation output routes participate in the explicit public theme", async () => {
  const [cart, productQuote, generalQuote] = await Promise.all([
    read("app/cart/page.tsx"),
    read("app/request-quote/page.tsx"),
    read("app/request-quote/general/page.tsx"),
  ]);

  for (const route of [cart, productQuote, generalQuote]) {
    assert.match(route, /className="public-experience"/);
    assert.match(route, /<PublicHeader/);
    assert.match(route, /<PublicFooter/);
  }
});

test("dashboard search, theme options, messenger, and password help have explicit dark contracts", async () => {
  const [css, search, selector, messages, passwordHelp] = await Promise.all([
    read("app/globals.css"),
    read("components/catalog/ProductSearch.tsx"),
    read("components/ui/ThemeSelector.tsx"),
    read("app/admin/messages/page.tsx"),
    read("components/auth/PasswordHelpChat.tsx"),
  ]);

  assert.match(search, /sen-search-input/);
  assert.match(search, /role="listbox"/);
  assert.match(selector, /<option/);
  assert.match(css, /html\[data-theme="dark"\] \.sen-dashboard-header \.sen-search-input\b/);
  assert.match(css, /html\[data-theme="dark"\] \.sen-dashboard-header \[role="listbox"\]/);
  assert.match(css, /html\[data-theme="dark"\] \.sen-dashboard-header select option/);

  assert.match(messages, /sen-admin-chat-header/);
  for (const selectorName of [
    ".sen-admin-messenger",
    ".sen-admin-chat-list",
    ".sen-admin-chat-thread",
    ".sen-admin-chat-header",
    ".sen-admin-chat-messages",
    ".sen-admin-message-row.is-customer .sen-admin-message-bubble",
    ".sen-admin-message-row.is-staff .sen-admin-message-bubble",
    ".sen-admin-chat-composer",
    ".sen-admin-chat-info",
  ]) {
    assert.ok(
      css.includes(`html[data-theme="dark"] .sen-dashboard-shell ${selectorName}`),
      `globals.css is missing dark messenger rule ${selectorName}`,
    );
  }

  assert.match(passwordHelp, /sen-password-help-panel/);
  assert.match(passwordHelp, /sen-password-help-form/);
  assert.match(css, /html\[data-theme="dark"\] \.sen-password-help-panel\s*\{/);
  assert.match(css, /html\[data-theme="dark"\] \.sen-password-help-form :where\(input, textarea\)/);
});

test("only document attachments opt into the admin messenger chip treatment", async () => {
  const messages = await read("app/admin/messages/page.tsx");
  const conditionalStart = messages.indexOf('attachment.mime_type.startsWith("image/")');
  const imageLinkStart = messages.indexOf("<a", conditionalStart);
  const documentBranchStart = messages.indexOf(") : (", imageLinkStart);
  const documentLinkEnd = messages.indexOf("</a>", documentBranchStart);

  assert.ok(conditionalStart >= 0 && imageLinkStart >= 0 && documentBranchStart >= 0 && documentLinkEnd >= 0);

  const imageBranch = messages.slice(imageLinkStart, documentBranchStart);
  const documentBranch = messages.slice(documentBranchStart, documentLinkEnd);

  assert.doesNotMatch(imageBranch, /sen-admin-document-attachment/);
  assert.match(documentBranch, /className="[^"]*\bsen-admin-document-attachment\b[^"]*"/);
});

test("public purchase action and footer use dark-readable color contracts", async () => {
  const [purchase, footer, css] = await Promise.all([
    read("components/catalog/ProductPurchasePanel.tsx"),
    read("components/layout/PublicFooter.tsx"),
    read("app/globals.css"),
  ]);

  assert.match(purchase, /Add to cart/);
  assert.match(purchase, /bg-white[^"]*text-cyan-900/);
  assert.match(css, /html\[data-theme="dark"\] \.public-experience :where\([^\n}]*\.text-cyan-900/);
  assert.match(footer, /border-t border-white\/10 py-5 text-sm text-slate-400/);
  assert.doesNotMatch(footer, /border-t border-white\/10 py-5 text-sm text-slate-500/);
});
