create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  name text,
  avatar_url text,
  provider text not null default 'google',
  provider_id text not null,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  google_id text unique,
  wallet_address text unique,
  daily_chars integer default 0,
  last_reset date,
  plan text default 'standard',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  key_hash text not null unique,
  label text,
  plan text default 'standard',
  active boolean default true,
  revoked_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  api_key_id uuid references api_keys(id) on delete set null,
  endpoint text,
  provider text,
  chars integer,
  bytes integer,
  tier text,
  cost numeric,
  created_at timestamptz default now()
);

create table if not exists marketplace_identities (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_key_hash text not null unique,
  user_id uuid references users(id) on delete cascade,
  plan text default 'standard',
  created_at timestamptz default now()
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  provider text not null, -- 'paypal', 'nowpayments'
  external_order_id text unique,
  amount numeric,
  currency text,
  plan_id text, -- 'executive_pro', 'starter', etc.
  status text default 'pending', -- 'pending', 'completed', 'failed'
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Per-minute rate limit tokens
create table if not exists rate_limits (
  user_id uuid primary key references users(id) on delete cascade,
  minute bigint not null,
  used integer default 0,
  updated_at timestamptz default now()
);

create table if not exists cyan_os_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  kind text not null,
  data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- Ocean API consumers (off-chain gateway)
create table if not exists ocean_consumers (
  id uuid primary key default gen_random_uuid(),
  consumer_hash text unique,
  created_at timestamptz default now()
);

-- Ocean quota usage per consumer
create table if not exists ocean_quotas (
  consumer_id uuid primary key references ocean_consumers(id) on delete cascade,
  month text not null,
  used integer default 0,
  updated_at timestamptz default now()
);
