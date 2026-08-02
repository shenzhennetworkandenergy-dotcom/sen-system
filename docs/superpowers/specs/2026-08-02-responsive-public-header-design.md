# Responsive public header design

## Goal

Make the public header readable and usable at every supported viewport without changing the site's navigation destinations or authentication rules. The desktop search field must remain comfortably usable, small screens must expose every menu item through a three-bar menu, and an authenticated user's dashboard must move into a clearly highlighted profile menu.

## Chosen design

Use one restrained desktop row at the `xl` breakpoint and a native disclosure menu below it.

- Desktop (`1280px` and wider): brand, primary navigation, flexible search, customer-only quote action, cart, and one profile disclosure.
- The profile disclosure shows the avatar and “My Profile” in its trigger. Its panel contains the highlighted role dashboard link first, followed by My Profile and Logout.
- Compact screens (below `1280px`): brand plus a three-bar Menu trigger. The open panel begins with a full-width search field, then public links, commerce links, and a separated account group. The dashboard is highlighted in that group.
- The customer quote link remains available in the compact authenticated menu.
- Native `<details>` disclosures provide keyboard support and work without extra client-side menu state.

## Layout and visual rules

- Give the header a wider header-only content boundary so the search input is not crushed by account controls.
- Allow the desktop search region to grow and establish a practical minimum width.
- Anchor dropdown panels to their triggers; cap the compact menu height to the viewport and allow internal scrolling.
- Keep the existing SEN navy/cyan visual language, with the dashboard link using a stronger blue/cyan treatment than ordinary menu items.
- Preserve visible focus states, reduced-motion behavior, and existing cart-count treatment.

## Alternatives considered

- A permanent two-row desktop header leaves more width but makes the header unnecessarily tall.
- A JavaScript drawer offers richer transitions but adds state and focus-management complexity that is not needed for this navigation.

## Verification

- Extend the public-header source contract before implementation.
- Run lint, TypeScript, the public-header verifier, the complete standalone test suite, and a production build.
- Browser-check the desktop row and compact three-bar menu at representative desktop, tablet, and phone widths.

