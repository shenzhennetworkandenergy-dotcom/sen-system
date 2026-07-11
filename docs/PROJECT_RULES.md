# SEN Platform Development Rules

## Purpose

This document defines the permanent development standards for the SEN Platform.

Every developer, AI agent, Codex task and future contributor must follow these rules before changing the repository.

These rules take precedence over individual coding preferences.

## 1. Project Vision

The SEN Platform is one integrated system consisting of:

- Public corporate website
- Product catalogue
- Quotation system
- E-commerce
- Customer portal
- ERP
- Inventory management
- Warehouse management
- Purchasing
- Supplier management
- CRM
- Sales
- Delivery
- Warranty
- Reports

Everything must be developed as one scalable platform.

## 2. Development Philosophy

Always build for:

- Scalability
- Maintainability
- Readability
- Reusability
- Performance
- Security
- Accessibility

Do not build temporary shortcuts that create technical debt.

## 3. Repository Rules

GitHub is the source of truth.

Never:

- Edit production directly
- Bypass Git
- Force push unless explicitly approved
- Commit secrets
- Commit generated build output

## 4. Branch Strategy

Every feature must have its own branch.

Examples:

- codex/project-foundation
- codex/homepage
- codex/navigation
- codex/product-card
- codex/product-page
- codex/dashboard-layout
- codex/inventory
- codex/warehouse

Do not develop unrelated features in the same branch.

## 5. Development Workflow

Every feature follows this lifecycle:

1. Requirement discussion
2. Architecture review
3. Implementation plan
4. Codex code generation
5. Diff review
6. Pull branch locally
7. Local verification
8. Merge after approval
9. Vercel deployment
10. Production verification

## 6. Local Verification Checklist

Every feature must pass:

```bash
npm install
npm run lint
npm run build
npm run dev
```

Verify:

- Homepage
- Relevant feature route
- `/environment-check`
- Browser console
- Terminal output
- No TypeScript errors
- No ESLint errors
- No unexpected warnings

## 7. Code Review Rules

Before merging:

- Review every changed file
- Check architecture
- Check folder placement
- Check naming
- Check dependencies
- Check security
- Check accessibility
- Check performance
- Check whether existing functionality still works

Never merge without review.

## 8. Component Rules

Components must be:

- Small
- Reusable
- Typed
- Accessible
- Server Components by default

Use `"use client"` only when client-side state, effects, browser APIs or event handling are required.

## 9. Folder Rules

- Group files by responsibility and feature
- Avoid duplicate utilities
- Avoid duplicate components
- Avoid duplicate Supabase clients
- Avoid unnecessary empty folders
- Do not scatter business logic through page components

## 10. Styling Rules

Use:

- Tailwind CSS
- CSS custom properties
- Shared design tokens
- Reusable layout components

Avoid:

- Repeated arbitrary colors
- Repeated hardcoded spacing
- Large inline-style objects
- Uncontrolled typography
- Unnecessary styling dependencies

## 11. UI Design Principles

The platform should feel:

- Modern
- Enterprise
- Premium
- Clean
- Spacious
- Professional
- Trustworthy

It should not look like:

- A generic WordPress theme
- An Alibaba clone
- A generic admin template
- A gaming interface
- An over-designed landing page

## 12. Homepage Principles

The homepage must communicate that SEN is:

- An international technology company
- An enterprise solution provider
- An engineering and sourcing company
- An industrial supplier
- A trusted partner for modern infrastructure

The visual direction should be closer to professional enterprise technology brands such as Cisco, Siemens, Schneider Electric, Dell Technologies and Huawei Enterprise, without copying them.

## 13. Security Rules

Never commit or expose:

- `.env`
- `.env.local`
- API keys
- Service-role keys
- Database passwords
- Access tokens
- Private connection strings
- Customer-sensitive data

Never expose server secrets to browser code.

## 14. Supabase Rules

- Use centralized shared Supabase utilities
- Do not create duplicate clients
- Keep authentication centralized
- Keep privileged operations server-side
- Do not scatter direct database calls across presentational UI components
- Use Row Level Security for production tables
- Do not use the service-role key in client-side code

## 15. Database Rules

- Plan schema before implementation
- Use clear and consistent naming
- Use proper relationships and constraints
- Avoid duplicated tables and duplicated fields
- Keep migrations version-controlled
- Design for multiple warehouses, countries, users and business units

## 16. Documentation Rules

Every major feature should update, where relevant:

- `CHANGELOG.md`
- Architecture documentation
- Coding standards
- Project phases
- Feature-specific documentation

Documentation must describe actual implemented behavior and must not claim unfinished functionality exists.

## 17. Commit Rules

Commit messages must be descriptive.

Good examples:

- Add homepage hero section
- Create shared button component
- Implement inventory layout
- Improve quotation workflow

Avoid vague messages such as:

- Update
- Fix
- Changes

## 18. Codex Rules

Codex must:

- Modify only the requested scope
- Preserve existing functionality
- Avoid unrelated refactoring
- Avoid unnecessary dependencies
- Report assumptions clearly
- Report limitations honestly
- Never fake verification
- Never replace real scripts with mock commands
- Never bypass lint or build failures
- Never change environment or deployment settings without explicit approval

## 19. Performance Rules

Prefer:

- Server Components
- Optimized images
- Minimal client JavaScript
- Lazy loading where appropriate
- Reusable utilities
- Efficient data fetching
- Clear caching decisions

Avoid unnecessary client-side rendering.

## 20. Accessibility Rules

All public and internal interfaces must:

- Use semantic HTML
- Support keyboard navigation
- Include visible focus states
- Use accessible labels
- Maintain readable contrast
- Respect reduced-motion preferences
- Work across desktop, tablet and mobile

## 21. Future-Proofing

Every feature must be designed with future growth in mind.

The platform should eventually support:

- Thousands of products
- Thousands of customers
- Multiple warehouses
- Multiple countries
- Multiple business units
- Multiple user roles
- Serial-number tracking
- Corporate and retail transactions
- Public website and internal ERP workflows

## 22. Golden Rule

Before writing code, ask:

> Will this still be a good solution two years from now?

If the answer is no, redesign it before implementation.
