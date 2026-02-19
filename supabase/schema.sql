create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  google_id text unique,
  wallet_address text unique,
  daily_chars integer default 0,
  last_reset date
);
