-- cycle_rollovers: stores debt/surplus carried between monthly cycles
create table if not exists public.cycle_rollovers (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  cycle_start_date date not null,
  total_debt     numeric(12,2) not null default 0,
  total_surplus  numeric(12,2) not null default 0,
  surplus_action text,          -- 'goal' | 'emergency' | 'income' | 'discard'
  surplus_goal_id uuid references public.goals(id) on delete set null,
  processed      boolean not null default false,
  created_at     timestamptz not null default now(),
  unique (user_id, cycle_start_date)
);

alter table public.cycle_rollovers enable row level security;

create policy "Users manage own rollovers"
  on public.cycle_rollovers for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
