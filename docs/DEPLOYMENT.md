# Production deployment

## Architecture

The application is a server-rendered Next.js service. Deploy it to Vercel and
use a hosted Supabase project for PostgreSQL, authentication, and storage. It
cannot be uploaded as a static HTML-only folder.

## 1. Prerequisites

- Node.js 20 or newer
- the locked dependencies installed with `npm ci`
- a Supabase project with CLI access
- a Vercel project connected to this repository
- the production domain added to the Supabase authentication redirect allowlist

Run the release gate before changing production:

```bash
npm run test:release
```

## 2. Environment variables

Create values from `.env.example`. Configure these in Vercel for the Production
environment:

| Name | Exposure | Required | Purpose |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser + server | Yes | Hosted Supabase URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser + server | Yes | Supabase publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Yes | Authorized administrative jobs |
| `CHATBOT_HASH_SALT` | Server only | Yes | Irreversible chatbot contact hashing |
| `SUPABASE_SECRET_KEY` | Server only | No | Alternative modern server secret |
| `UDDOKTAPAY_*` | Server only | No | UddoktaPay checkout credentials |
| `EPS_*` | Server only | No | EPS checkout credentials |

Never prefix a secret with `NEXT_PUBLIC_`. Keep optional payment gateways
disabled until their credentials and webhook contract are configured.

## 3. Promote the database

Link the intended production project, inspect pending migrations, and apply
them before deploying the application:

```bash
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase migration list --linked
npx supabase db push --linked
npx supabase migration list --linked
```

The migration set creates tables, constraints, indexes, functions, RLS
policies, storage buckets, and grants. Keep `auto_expose_new_tables` disabled;
new API objects must receive explicit grants and policies in migrations.

## 4. Deploy the exact verified commit

Push the verified commit to the repository's production branch. Vercel can
deploy it from Git, or an authorized operator can run:

```bash
npx vercel --prod --yes
```

Wait until Vercel reports the deployment as Ready. Confirm the deployment's Git
commit matches the commit that passed `npm run test:release`.

## 5. Production smoke checks

Verify:

1. `/`, `/products`, `/about`, `/contact`, `/robots.txt`, and `/sitemap.xml`;
2. product search, category filters, product detail, quotation, and login;
3. admin dashboard, category administration, product create/edit and gallery;
4. sales product search, line editing, invoice and quotation downloads;
5. chatbot matching, confirmation buttons, bilingual short replies, and inquiry
   capture;
6. user profile, permissions, archive/permanent-delete mode, and downloads;
7. browser console and server function logs contain no unexpected errors.

Check mobile, tablet, laptop, and desktop layouts for the homepage, catalogue,
product page, authentication, and representative admin form.

## 6. Storage and authentication

Verify the product-media, profile-image, HR-document, and support-attachment
buckets and their policies exist. Confirm uploaded product gallery images can
be read through the application's signed/public URL path.

Set the Supabase site URL to the production origin and add only trusted callback
origins. Production email flows require a configured SMTP provider.

## 7. Rollback

If the application release fails, promote the previously verified Vercel
deployment. Do not reverse an applied data migration by editing or deleting its
file. Create a forward migration that safely restores compatible behavior,
test it locally, and apply it through the same release gate.

