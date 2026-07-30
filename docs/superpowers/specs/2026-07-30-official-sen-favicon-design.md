# Official SEN Favicon Design

## Goal

Replace the generic, redrawn favicon with browser and installable-app icons derived directly from SEN's official logo at `public/brand/sen-official-logo.png`.

## Design

- Preserve the official logo artwork, colors, wording, and proportions.
- Create square, optimized icon files from the official source for standard browser, SVG-capable browser, and Apple touch-icon use.
- Use a white background so the existing full-color logo remains legible at small sizes and across browser themes.
- Point the root metadata and web app manifest only to these official-logo derivatives.
- Remove the generic hand-drawn icon artwork from favicon use.

## Verification

- Add an automated check that favicon metadata and the web app manifest reference official-logo-derived assets.
- Confirm the generated files are square, valid, and available at the configured paths.
- Run lint and the production build.
- Inspect the favicon in the local website and account for browser favicon caching during verification.

## Scope

This change affects favicon and application-icon assets only. It does not alter the visible header, footer, or the official source logo.
