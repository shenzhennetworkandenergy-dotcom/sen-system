# Premium Glass-Neon Public Header Design

## Goal

Redesign SEN's shared public website header so it feels more attractive, premium, and interactive while remaining fast, responsive, accessible, and consistent with the existing SEN brand.

## Visual direction

Use a premium glass-tech style with restrained neon accents:

- Deep navy-to-blue translucent header surface
- Thin cyan and violet edge highlights
- Soft shadows that separate the sticky header from page content
- Compact rounded glass boxes for every navigation and account action
- Clear visual hierarchy between primary navigation, search, commerce, and account controls
- Controlled neon emphasis rather than continuous or distracting glow

The logo and company identity remain prominent. The official SEN logo asset must continue to be used without alteration.

## Header structure

### Announcement strip

- Keep the short company-sector message and supply-network message.
- Reduce visual noise with a slim, readable strip.
- Add a subtle static gradient and a small status accent rather than a large animation.
- Correct any visibly corrupted separator or arrow characters while editing the header.

### Brand area

- Present the SEN logo and company name inside a polished brand group.
- Keep the logo image optimized through Next.js Image.
- Use a gentle hover lift and restrained glow.
- Do not animate the logo continuously.

### Primary navigation

- Display Products, About, and Contact as individual rounded glass boxes.
- Each box uses a visible border and sufficient contrast at rest.
- Hover and keyboard focus add a small vertical lift, brighter border, soft neon shadow, and short light-sweep effect.
- The animation must use transform and opacity wherever possible.

### Product search

- Preserve the existing live product suggestion behavior.
- Present the search field and submit action as one visually unified glass search capsule.
- Maintain readable white input contrast and a clear cyan search action.
- Do not change the search endpoint or product-selection behavior.

### Authenticated actions

- Present Request a Quote, Cart, Dashboard, My Profile, and Logout as organized glass action boxes.
- Keep the real profile photo, selected emoji, or initials through the existing avatar component.
- Give the cart count a clear, compact badge.
- Avoid wrapping labels awkwardly at normal desktop widths.
- Use a more compact dashboard label where necessary while preserving the destination and meaning.

### Guest actions

- Present Login as a glass navigation box.
- Keep Create Account and Request a Quote visually prominent, with Request a Quote as the primary neon-accented action.

## Motion

Animations must be short, purposeful, and lightweight:

- Menu entrance: a subtle fade and vertical settle when the header first appears
- Menu hover: lift by a few pixels with a brighter border and shadow
- Light sweep: a short pseudo-element highlight that only runs on hover or focus
- Mobile panel: quick opacity and vertical movement when opened
- Cart badge: optional one-time entrance emphasis when it contains items

No third-party animation library, canvas effect, video, or continuously running header animation will be added. All nonessential motion must stop under `prefers-reduced-motion: reduce`.

## Responsive behavior

- Large desktop: show brand, primary navigation, compact search, and account actions in a balanced single header layout.
- Laptop: reduce gaps and label width before hiding important actions.
- Tablet and mobile: show the brand, animated menu control, and a full-width search row.
- The mobile menu opens as a glass panel with every action in its own full-width box.
- All touch targets must remain comfortably usable.
- The header must not introduce horizontal scrolling.

## Accessibility

- Preserve semantic `header`, `nav`, list, link, search, and button elements.
- Maintain visible keyboard focus states.
- Meet readable foreground/background contrast for all default and hover states.
- Keep meaningful accessible labels for the logo, search, navigation, and menu control.
- Respect reduced-motion preferences.

## Performance constraints

- Use CSS only for new motion and visual effects.
- Add no new runtime dependency.
- Avoid large assets and additional network requests.
- Prefer transforms and opacity to layout-changing animation.
- Keep blur areas limited to the header and mobile panel.
- Preserve server rendering for the public header and the existing small client boundary for search and mobile navigation.

## Verification

- Add an automated structural/style check for the new header classes, boxed navigation, reduced-motion handling, and absence of a new animation dependency.
- Run focused tests, lint, and the production build.
- Inspect authenticated and guest header states where available.
- Visually verify desktop, laptop, tablet, and mobile widths.
- Confirm product search suggestions, Cart, Dashboard, My Profile, Logout, Login, Create Account, and Request a Quote remain functional.
- Deploy through the production branch and verify the Vercel deployment and public URL.

## Scope

This change covers the shared public header, its responsive mobile navigation, and the header-specific presentation of the existing product search. It does not redesign the admin dashboard header, homepage hero, chatbot, product database, or authentication workflows.
