alter table public.users
  add column if not exists paypal_subscription_id text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists email text,
  add column if not exists name text;

create index if not exists users_paypal_subscription_id_idx on public.users (paypal_subscription_id);
create index if not exists users_google_id_idx on public.users (google_id);
