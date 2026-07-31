# SEN System

SEN System is the commerce, inventory, sales, quotation, purchasing, CRM, HR,
customer-service, and public catalogue platform for Shenzhen Energy & Networks.
It uses Next.js 16, React 19, Supabase, and PostgreSQL.

## Local development

Requirements:

- Node.js 20 or newer
- npm
- Docker Desktop for the optional local Supabase stack
- Supabase CLI access for database migrations

Install the locked dependencies and create a local environment file:

```bash
npm ci
copy .env.example .env.local
npm run supabase:start
npm run dev
```

Replace the placeholders in `.env.local` with the values printed by the local
Supabase status command. Never commit `.env.local` or production credentials.

## Quality checks

```bash
npm run test:release
```

The release gate checks the project structure, database/category migrations,
module verifiers, unit tests, lint rules, and a production build.

## Database migrations

Database history is stored in `supabase/migrations`. Apply every pending
migration before deploying application code:

```bash
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push --linked
```

Review the migration list before and after the push. Do not edit a migration
that has already been applied to a shared environment; add a new migration.

## Production deployment

The supported production architecture is:

- Vercel: Next.js application and server routes
- Supabase: PostgreSQL, authentication, and storage

Follow [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for environment setup, database
promotion, deployment, verification, rollback, and operational checks.

## Documentation

- [Dynamic business categories](docs/DYNAMIC_BUSINESS_CATEGORIES.md)
- [Deployment guide](docs/DEPLOYMENT.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Permissions](docs/PERMISSIONS.md)
- [Inventory](docs/INVENTORY.md)
- [Sales](docs/SALES.md)
- [Customer commerce](docs/CUSTOMER_COMMERCE.md)

