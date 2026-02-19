create table if not exists public.nowpayments_ipn_logs (
  id bigserial primary key,
  received_at timestamptz not null default now(),
  order_id text,
  payment_id text,
  payment_status text,
  sig text,
  raw jsonb not null
);

create index if not exists nowpayments_ipn_logs_order_id_idx on public.nowpayments_ipn_logs (order_id);
create index if not exists nowpayments_ipn_logs_payment_id_idx on public.nowpayments_ipn_logs (payment_id);
create index if not exists nowpayments_ipn_logs_received_at_idx on public.nowpayments_ipn_logs (received_at);
