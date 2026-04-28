-- ============================================================
-- Retail Bridge — Supabase Schema + RLS Policies
-- Run this in: Supabase Dashboard → SQL Editor
-- ============================================================
 
-- ────────────────────────────────────────────
-- EXTENSIONS
-- ────────────────────────────────────────────
create extension if not exists "uuid-ossp";
 
-- ────────────────────────────────────────────
-- ENUMS
-- ────────────────────────────────────────────
create type role_type        as enum ('MERCHANT', 'ADMIN', 'GUEST');
create type listing_status   as enum ('ACTIVE', 'PENDING', 'CLOSED');
create type claim_status     as enum ('PENDING', 'ACCEPTED', 'DECLINED');
create type tx_status        as enum ('PENDING', 'SELLER_CONFIRMED', 'BUYER_CONFIRMED', 'COMPLETED', 'CANCELLED');
create type notif_type       as enum (
  'CLAIM_RECEIVED', 'CLAIM_ACCEPTED', 'CLAIM_DECLINED',
  'DELIVERY_CONFIRMED', 'LISTING_EXPIRING', 'SYSTEM'
);
 
-- ────────────────────────────────────────────
-- PROFILES  (mirrors auth.users)
-- ────────────────────────────────────────────
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  business_name text        not null,
  city          text        not null,
  phone         text,
  role          role_type   not null default 'MERCHANT',
  is_flagged    boolean     not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
 
-- Auto-create profile row when a new auth user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, business_name, city, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'business_name', 'Unknown Business'),
    coalesce(new.raw_user_meta_data->>'city', 'Unknown City'),
    new.raw_user_meta_data->>'phone'
  );
  return new;
end;
$$;
 
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
 
-- ────────────────────────────────────────────
-- LISTINGS
-- ────────────────────────────────────────────
create table public.listings (
  id              uuid          primary key default uuid_generate_v4(),
  seller_id       uuid          not null references public.profiles(id) on delete cascade,
  product_name    text          not null,
  quantity        numeric(10,2) not null check (quantity > 0),
  unit            text          not null,          -- kg, box, pallet …
  price           numeric(10,2) not null check (price >= 0),
  photos          text[]        not null default '{}',
  expiry_date     date,
  status          listing_status not null default 'ACTIVE',
  auto_expires_at timestamptz   not null default (now() + interval '48 hours'),
  location        text,
  notes           text,
  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now()
);
 
create index idx_listings_seller   on public.listings(seller_id);
create index idx_listings_status   on public.listings(status);
create index idx_listings_expires  on public.listings(auto_expires_at);
create index idx_listings_search   on public.listings using gin(to_tsvector('simple', product_name));
 
-- ────────────────────────────────────────────
-- CLAIMS
-- ────────────────────────────────────────────
create table public.claims (
  id                 uuid         primary key default uuid_generate_v4(),
  listing_id         uuid         not null references public.listings(id) on delete cascade,
  buyer_id           uuid         not null references public.profiles(id) on delete cascade,
  quantity_requested numeric(10,2) not null check (quantity_requested > 0),
  status             claim_status not null default 'PENDING',
  message            text,
  created_at         timestamptz  not null default now(),
  updated_at         timestamptz  not null default now(),
  -- a buyer can only claim a listing once at a time
  unique (listing_id, buyer_id)
);
 
create index idx_claims_listing on public.claims(listing_id);
create index idx_claims_buyer   on public.claims(buyer_id);
 
-- ────────────────────────────────────────────
-- TRANSACTIONS
-- ────────────────────────────────────────────
create table public.transactions (
  id                   uuid      primary key default uuid_generate_v4(),
  claim_id             uuid      not null unique references public.claims(id),
  listing_id           uuid      not null references public.listings(id),
  seller_id            uuid      not null references public.profiles(id),
  buyer_id             uuid      not null references public.profiles(id),
  quantity             numeric(10,2) not null,
  total_price          numeric(10,2) not null,
  status               tx_status not null default 'PENDING',
  seller_confirmed_at  timestamptz,
  buyer_confirmed_at   timestamptz,
  completed_at         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
 
create index idx_tx_seller on public.transactions(seller_id);
create index idx_tx_buyer  on public.transactions(buyer_id);
create index idx_tx_status on public.transactions(status);
 
-- ────────────────────────────────────────────
-- NOTIFICATIONS
-- ────────────────────────────────────────────
create table public.notifications (
  id         uuid        primary key default uuid_generate_v4(),
  user_id    uuid        not null references public.profiles(id) on delete cascade,
  type       notif_type  not null,
  title      text        not null,
  message    text        not null,
  is_read    boolean     not null default false,
  meta       jsonb,                              -- e.g. { listing_id, claim_id }
  created_at timestamptz not null default now()
);
 
create index idx_notif_user_unread on public.notifications(user_id, is_read);
 
-- ────────────────────────────────────────────
-- UPDATED_AT TRIGGER (shared helper)
-- ────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
 
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();
 
create trigger trg_listings_updated_at
  before update on public.listings
  for each row execute function public.set_updated_at();
 
create trigger trg_claims_updated_at
  before update on public.claims
  for each row execute function public.set_updated_at();
 
create trigger trg_transactions_updated_at
  before update on public.transactions
  for each row execute function public.set_updated_at();
 
-- ────────────────────────────────────────────
-- AUTO-EXPIRE LISTINGS (pg_cron or call via backend cron)
-- Mark ACTIVE listings as CLOSED once auto_expires_at has passed
-- ────────────────────────────────────────────
create or replace function public.expire_listings()
returns void language plpgsql as $$
begin
  update public.listings
  set status = 'CLOSED'
  where status = 'ACTIVE'
    and auto_expires_at < now();
end;
$$;
 
-- ════════════════════════════════════════════
-- ROW LEVEL SECURITY POLICIES
-- ════════════════════════════════════════════
 
alter table public.profiles      enable row level security;
alter table public.listings      enable row level security;
alter table public.claims        enable row level security;
alter table public.transactions  enable row level security;
alter table public.notifications enable row level security;
 
-- ── Profiles ────────────────────────────────
-- Anyone (including guests) can read profiles
create policy "profiles: public read"
  on public.profiles for select
  using (true);
 
-- Only the owner can update their own profile
create policy "profiles: owner update"
  on public.profiles for update
  using (auth.uid() = id);
 
-- ── Listings ────────────────────────────────
-- Everyone can read ACTIVE listings (guest browsing)
create policy "listings: public read active"
  on public.listings for select
  using (status = 'ACTIVE' or auth.uid() = seller_id);
 
-- Only authenticated merchants can insert
create policy "listings: merchant insert"
  on public.listings for insert
  with check (auth.uid() = seller_id);
 
-- Only the seller can update their own listing
create policy "listings: seller update"
  on public.listings for update
  using (auth.uid() = seller_id);
 
-- ── Claims ──────────────────────────────────
-- Seller sees claims on their listings; buyer sees their own claims
create policy "claims: parties select"
  on public.claims for select
  using (
    auth.uid() = buyer_id
    or auth.uid() = (select seller_id from public.listings where id = listing_id)
  );
 
-- Authenticated merchant can place a claim
create policy "claims: buyer insert"
  on public.claims for insert
  with check (auth.uid() = buyer_id);
 
-- Seller can update status (accept/decline); buyer cannot
create policy "claims: seller update"
  on public.claims for update
  using (
    auth.uid() = (select seller_id from public.listings where id = listing_id)
  );
 
-- ── Transactions ─────────────────────────────
-- Only the two parties can see the transaction
create policy "transactions: parties select"
  on public.transactions for select
  using (auth.uid() = seller_id or auth.uid() = buyer_id);
 
-- System/backend creates transactions (service role key bypasses RLS)
-- No direct insert from client
 
-- Both parties can update (confirm delivery)
create policy "transactions: parties update"
  on public.transactions for update
  using (auth.uid() = seller_id or auth.uid() = buyer_id);
 
-- ── Notifications ────────────────────────────
create policy "notifications: owner only"
  on public.notifications for select
  using (auth.uid() = user_id);
 
create policy "notifications: mark read"
  on public.notifications for update
  using (auth.uid() = user_id);