# Fast Colorful Dashboard, Profile Hover, and Theme Design

## Objective

Improve the shared SEN experience without changing business logic:

- open the desktop **My Profile** menu automatically when a mouse pointer enters it;
- make admin, employee, and customer dashboard modules visually distinct and lively;
- add a persistent **Auto / Light / Dark** appearance selector;
- keep every relevant label, card, table, form, menu, and status readable in both resolved themes;
- preserve fast loading, keyboard/touch access, reduced-motion support, and light print output.

## Scope and invariants

This change is presentation and interaction only. It does not change routes, permissions, database queries, work-count logic, authentication, module availability, or print data.

The public header remains an async Server Component. Only the hover disclosure and theme selector become small Client Components. Dashboard pages remain Server Components except for their existing navigation boundary.

No animation package, theme provider, image request, font request, or other runtime dependency is added.

## Profile menu behavior

The existing native `<details>/<summary>` disclosure remains the semantic foundation so click, keyboard, touch, and no-JavaScript behavior continue to work.

A narrow client wrapper enhances only fine mouse pointers:

1. A mouse pointer entering a closed profile disclosure opens it and records that hover caused the opening.
2. Pointer leave closes only a hover-opened menu. A menu opened by click or keyboard remains open.
3. Focus inside the trigger or menu prevents hover-leave from closing it.
4. A first mouse click on a hover-opened summary pins it open instead of immediately closing it; the next native click closes it.
5. Touch and pen input do not trigger hover behavior.
6. A transparent pointer bridge covers the visual gap between the trigger and panel so moving into the menu does not flicker.

The wrapper accepts server-rendered children, keeping avatar data, links, authentication, and Supabase code outside the client bundle.

## Dashboard visual system

Dashboard modules use a deterministic, data-driven six-tone palette:

- blue: dashboard and account foundations;
- cyan: commerce and customer workflows;
- emerald: inventory and logistics;
- amber: purchasing and finance;
- violet: organization, HR, and support;
- rose: reports and system functions.

Every navigation group and overview module card receives a semantic `data-module-tone` attribute. CSS custom properties translate that tone into a restrained accent, tint, ink color, and glow. Existing active-navigation and attention-count states keep priority so permissions and pending work remain obvious.

The palette is applied to:

- dashboard sidebar groups and icons;
- admin operational and planned modules;
- employee HR and permitted-module cards;
- customer account module cards.

Cards use a pale tinted surface with a strong accent rail and normal high-contrast foreground text. Unavailable employee modules receive a visible state treatment instead of lowering the opacity of the whole card.

## Motion and performance

Motion is CSS-only and finite:

- one short accent-rail reveal per module card;
- subtle icon movement and card lift on hover/focus;
- small stagger delays supplied by `nth-child` selectors;
- no looping dashboard animation, blur-heavy canvas, JavaScript animation, or layout animation.

Only opacity and transform are animated for entrance effects. Existing `prefers-reduced-motion` rules disable animation and transition on elements and pseudo-elements.

Theme changes are intentionally immediate rather than animated. This prevents color flashes and avoids repaint-heavy transitions across large pages.

## Theme architecture

The appearance preference is `auto`, `light`, or `dark`. The resolved theme is always `light` or `dark`.

- `auto` follows `prefers-color-scheme` and updates when the operating-system preference changes.
- `light` and `dark` override the operating system.
- The preference is stored under `sen-theme-mode` in `localStorage` and synchronized across tabs.
- `<html data-theme-mode>` stores the preference and `<html data-theme>` stores the resolved theme.
- `document.documentElement.style.colorScheme` is kept in sync for native controls.

The root layout renders a safe light default and a small inline bootstrap in `<head>`. Following the installed Next.js 16 guidance, the script validates the stored value, resolves Auto with `matchMedia`, and updates `<html>` before first paint. `suppressHydrationWarning` belongs on `<html>` because that is the element the bootstrap changes.

The theme selector is placed in:

- the desktop public profile panel for authenticated users and public header actions for guests;
- the mobile public navigation panel;
- the dashboard header for admin, employee, and customer workspaces.

It is a native labelled select/control with three explicit choices, not an ambiguous icon-only cycle.

## Theme and contrast rules

OS-only dark media blocks are replaced by explicit `html[data-theme="dark"]` selectors. This is required so Light continues to work on a dark operating system.

Core colors meet WCAG AA for normal text:

- light foreground `#0f172a` on surface `#ffffff`;
- light muted `#475569` on `#ffffff`;
- white action text on primary `#1d4ed8`;
- dark foreground `#f8fafc` on background `#070d1a`;
- dark muted `#cbd5e1` on surface `#0f172a`;
- dark primary `#60a5fa` on `#07111f`;
- dark error `#fecaca` on `#3f141a`;
- dark success `#bbf7d0` on `#0d2f22`;
- dark warning `#fde68a` on `#3b2605`.

Scoped compatibility selectors correct existing fixed Tailwind neutral, information, success, warning, and error utilities inside `.sen-dashboard-shell` and `.public-experience`. They do not globally rewrite unrelated pages.

The public catalogue gets explicit dark variables for surfaces, panels, product cards, rich content, inputs, and category-themed areas. Header, hero, CTA, and footer retain their intentionally dark brand treatment in either theme.

Printable artifacts remain light and are excluded from compatibility rules. `.cashbook-print-sheet`, `.quotation-page`, `.document-page`, and `.serial-label` explicitly use `color-scheme: light` and white paper colors.

## Accessibility

- Native disclosure, select, links, and buttons remain keyboard accessible.
- Hover enhancement never replaces focus or click behavior.
- Focus rings stay visible in both themes.
- Text and functional icons meet WCAG AA contrast targets.
- Color is not the only signal for active, unavailable, planned, or attention states.
- Reduced-motion preference removes nonessential motion.

## Verification

Automated checks cover:

- hover-pointer gating and integration while keeping `PublicHeader` server-side;
- profile disclosure source contract and pointer bridge;
- theme preference validation and resolution;
- pre-paint root-layout integration and absence of OS-only dark overrides;
- core light/dark contrast ratios;
- deterministic module-tone mappings and aliases;
- shared tone attributes on sidebar and admin/employee/customer module cards;
- dark compatibility selectors, print exclusions, and reduced-motion coverage.

Browser checks cover desktop and mobile navigation, mouse hover and keyboard profile behavior, Auto/Light/Dark selection, persistence after reload, public product and dashboard readability, responsive module cards, and white print output. Full standalone tests, lint, TypeScript, and a production build remain release gates.
