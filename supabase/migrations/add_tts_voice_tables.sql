create table if not exists public.devices (
  user_id text not null,
  device_id text not null,
  voice_id text,
  updated_at timestamptz not null default now(),
  primary key (user_id, device_id)
);

create table if not exists public.voice_changes (
  id bigserial primary key,
  user_id text not null,
  device_id text not null,
  amount numeric,
  provider text,
  status text,
  order_id text,
  created_at timestamptz not null default now()
);

create index if not exists voice_changes_user_device_idx on public.voice_changes(user_id, device_id, created_at desc);
create index if not exists voice_changes_order_idx on public.voice_changes(order_id);

create table if not exists public.rate_limits (
  user_id text primary key,
  minute bigint not null,
  used integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.eleven_credits (
  user_id text primary key,
  month text not null,
  used integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.ocean_consumers (
  id uuid primary key default gen_random_uuid(),
  consumer_hash text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.ocean_quotas (
  consumer_id uuid not null references public.ocean_consumers(id) on delete cascade,
  month text not null,
  used integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (consumer_id, month)
);
