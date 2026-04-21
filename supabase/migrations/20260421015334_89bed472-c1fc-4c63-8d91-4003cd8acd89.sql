-- Per-user catalog of synced save data (state slots + SRAM)
create table public.cloud_saves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id text not null,           -- matches local IndexedDB game id
  game_name text not null,         -- denormalised for cross-device display
  system text not null,            -- 'gba' | 'gbc' | 'nes'
  kind text not null check (kind in ('sram', 'state')),
  slot integer not null default 0, -- 0 = sram, 1..9 = state slots
  file_path text not null,         -- path in the game-saves bucket
  size integer not null default 0,
  thumbnail text,                  -- data URL, only for state slots
  updated_at timestamptz not null default now(),
  unique (user_id, game_id, kind, slot)
);

create index cloud_saves_user_game_idx on public.cloud_saves (user_id, game_id);

alter table public.cloud_saves enable row level security;

-- A user can only see / write their own catalog rows.
create policy "Users select own saves"
  on public.cloud_saves for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users insert own saves"
  on public.cloud_saves for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users update own saves"
  on public.cloud_saves for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users delete own saves"
  on public.cloud_saves for delete
  to authenticated
  using (auth.uid() = user_id);

-- Auto-bump updated_at on every row update.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger cloud_saves_touch
  before update on public.cloud_saves
  for each row execute function public.touch_updated_at();

-- Private bucket for the actual save binaries.
insert into storage.buckets (id, name, public)
values ('game-saves', 'game-saves', false)
on conflict (id) do nothing;

-- Files are stored under {user_id}/{game_id}/{kind}-{slot}.bin
-- so a path's first segment is always the owner's user id.
create policy "Users read own save files"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'game-saves'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users upload own save files"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'game-saves'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users update own save files"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'game-saves'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users delete own save files"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'game-saves'
    and (storage.foldername(name))[1] = auth.uid()::text
  );