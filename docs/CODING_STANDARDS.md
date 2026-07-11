# SEN Platform Coding Standards

## TypeScript

Use strict TypeScript, explicit public types for shared APIs and narrow union types where they improve safety. Avoid `any` unless there is a documented integration boundary.

## Naming Conventions

Use descriptive names that reflect responsibility. Components use `PascalCase`, functions and variables use `camelCase`, constants use descriptive `camelCase` or `UPPER_SNAKE_CASE` only for true constants.

## Files and Folders

Use kebab-case or clear domain folder names for route and feature folders. Shared UI components live in `components/ui`; shared layout components live in `components/layout`; general constants and utilities live in `lib`.

## Components

Components must be small, typed, accessible and reusable. Prefer Server Components by default. Add `"use client"` only for client-side state, effects, browser APIs or event handling.

## Imports

Use the configured `@/` path alias for application imports. Keep imports organized by external packages first, then internal modules. Do not wrap imports in `try`/`catch` blocks.

## Error Handling

Handle expected errors close to the boundary that can recover from them. Avoid swallowing errors silently. User-facing errors should be clear without exposing secrets or sensitive implementation details.

## Validation

Validate user input at system boundaries before using it in database operations or business workflows. Future form and API validation should be centralized and typed.

## Accessibility

Use semantic HTML, visible focus states, accessible labels, keyboard-friendly navigation and sufficient color contrast. Interfaces must work across desktop, tablet and mobile.

## Responsive Design

Build mobile-responsive layouts with Tailwind CSS and shared layout primitives. Avoid one-off spacing and typography patterns when a shared component or token is appropriate.

## Security

Never commit secrets, expose server variables to client code or place privileged operations in presentational components. Keep future authorization logic centralized.

## Lint and Build

Every meaningful change must pass `npm run lint` and `npm run build` before merge. Do not replace real scripts with mock commands or bypass failures.

## Dependencies

Prefer zero new dependencies. Add a package only when it materially reduces maintenance risk and cannot be reasonably implemented with existing tools.

## Duplicate Utility Prevention

Search the repository before adding utilities, constants, components or clients. Reuse existing valid patterns and avoid duplicate Supabase clients or class-name helpers.

## Supabase Utilities

Supabase clients belong in `lib/supabase`. Do not create feature-local Supabase clients. Browser clients may only use public environment variables, while privileged work must use future server-side utilities.
