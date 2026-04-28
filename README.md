# Retail Bridge Fast Demo

Fast demo edition of a B2B surplus food marketplace built with a clean `client` + `server` split:

- `client`: React 18 + Vite + Tailwind + Framer Motion + `react-i18next`
- `server`: Express API for protected business transitions that should not rely on client-side writes
- `supabase/schema.sql`: Supabase schema, enums, triggers, and RLS policies
- `docker-compose.yml`: Hostinger-friendly frontend + backend deployment bundle

## Features

- Supabase Auth signup/signin with automatic `public.profiles` creation via the provided trigger
- Marketplace grid for active listings
- Seller listing creation with database-backed `auto_expires_at`
- Buyer claim flow creating `public.claims` rows with `PENDING` status
- Seller accept flow via backend API:
  - verifies seller ownership
  - marks claim as `ACCEPTED`
  - locks listing as `PENDING`
  - creates a transaction row
- Dual delivery confirmation via backend API:
  - seller or buyer confirms independently
  - transaction becomes `COMPLETED` only when both have confirmed
- Arabic / English toggle with RTL support
- Demo seed script for 5 sample listings

## Supabase Setup

1. Create a new Supabase project.
2. Open the SQL editor and run `supabase/schema.sql`.
3. In Supabase Auth, enable email/password sign-in.
4. Copy `.env.example` to `.env` at the project root and fill in:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `DATABASE_URL` (put your Postgres password inside this connection string)
   - `SMTP_*` values if you want claim and delivery emails to send
5. In Supabase Auth providers, enable:
   - Email
   - Google

## Local Development

Node.js 20+ is recommended.

```bash
npm install
npm run dev
```

Client runs on `5173` by default, API on `4000`.

## Seed Demo Data

After configuring your environment variables:

```bash
npm run seed
```

This creates demo seller users if they do not already exist:

- `seller1@retailbridge.demo`
- `seller2@retailbridge.demo`

Password for both:

```text
DemoPass123!
```

## Hostinger VPS Deployment

1. Install Docker and Docker Compose on the VPS.
2. Upload the project to the server.
3. Create a root `.env` file using `.env.example`.
4. Build and start the stack:

```bash
docker compose up -d --build
```

Default ports:

- Frontend (Nginx): `8080`
- Backend (Express): `4000`

If you place the stack behind a Hostinger reverse proxy, point your domain to the Nginx container port and keep the API internal through Docker networking.

## Notes

- Listing expiry uses the SQL function `expire_listings()`.
- The backend exposes `POST /api/jobs/expire-listings` so you can wire a VPS cron or scheduler to run expirations.
- Listing reads rely on Supabase RLS.
- Sensitive transitions use the Express server with the service role key and explicit ownership checks.
- Password reset uses Supabase Auth email reset links.
- Google login uses Supabase OAuth and requires your Google provider credentials in the Supabase dashboard.
- Email notifications are sent by the Express server when `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM` are configured.
