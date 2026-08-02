# Animated Appearance and Compact Profile Design

## Objective

Refine the existing appearance control and shared profile page without changing authentication, profile data, upload behavior, validation, permissions, or database writes.

The result must:

- make Auto, Light, and Dark selection feel animated and intentional;
- keep theme changes fast and free from full-page transition flashes;
- reduce the profile page's vertical space while improving visual hierarchy;
- remain readable and usable in both themes and across phone, tablet, and desktop widths.

## Chosen approach

Use a small animated mode glyph inside the existing native appearance selector and a restrained color-coded accordion system for the profile sections.

This is preferred over a full-page theme fade because it avoids repainting every surface and preserves the existing pre-paint theme bootstrap. It is more polished than only reducing padding because the section tones, summaries, and disclosure state make the long profile easier to scan.

No dependency, image, font, database migration, or new client provider is added.

## Appearance animation

The native select remains the accessible control and retains explicit Auto, Light, and Dark options. A decorative glyph reflects the selected preference:

- Auto: a system/automatic symbol;
- Light: a sun symbol;
- Dark: a moon symbol.

Changing mode remounts only the glyph, triggering a short CSS-only pop/rotate animation. The selector receives a subtle mode-colored glow. The page colors still change immediately, so the no-flash behavior and performance characteristics remain intact.

The animation is finite, transform/opacity-only, and disabled by `prefers-reduced-motion`. The compact control stays within the existing narrow dashboard header budget.

## Compact profile layout

The profile route keeps the existing server-rendered forms and actions. Presentation changes are scoped under a `sen-profile-page` root.

### Hero and media

- Reduce cover height and avatar size.
- Keep the identity, biography, and role badge adjacent to the avatar.
- Present picture and cover controls as compact media cards.
- Shrink emoji choices, upload inputs, help copy, and action buttons while retaining comfortable touch targets.

### Information sections

- Use compact native `<details>/<summary>` cards.
- Open About and Contact by default because they contain the most frequently edited fields.
- Collapse Location, Work, Social links, and Emergency contact by default to shorten the initial page.
- Give each section one restrained semantic tone: blue, cyan, emerald, violet, rose, or amber.
- Add a visible disclosure chevron, compact description, and short finite accent reveal.
- Reduce field, grid, textarea, and button spacing without changing form names or submitted values.

The two-column desktop layout remains, while phone widths use a single column. Opening a section expands naturally without fixed heights or clipped content.

## Theme and contrast

Light mode uses white/tinted cards with dark slate text. Dark mode uses navy/slate cards with light text and preserves each section's accent. Inputs, read-only fields, descriptions, buttons, focus rings, and upload controls receive explicit readable styles in both modes.

Color is decorative; headings, labels, summaries, and disclosure state remain understandable without color.

## Motion and accessibility

- Keep native select and details semantics.
- Preserve keyboard, screen-reader, touch, and pointer behavior.
- Use only short opacity/transform animations.
- Never loop profile or theme animations.
- Disable appearance glyph and profile accent motion when reduced motion is requested.
- Maintain visible focus indicators and minimum practical touch targets.

## Verification

Automated contracts will cover:

- appearance glyph mapping, mode hook, finite animation, and reduced-motion cancellation;
- compact profile root, hero/media hooks, section tones, default-open policy, and unchanged form actions/field names;
- explicit light/dark profile styling and responsive rules.

Browser verification will cover Auto/Light/Dark changes, theme persistence, profile readability, disclosure behavior, and horizontal overflow at representative phone, tablet, and desktop widths. Full standalone tests, lint, TypeScript, production build, independent diff review, production route smoke checks, and Vercel verification remain release gates.
