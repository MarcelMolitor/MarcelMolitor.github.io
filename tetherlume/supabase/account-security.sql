-- Preferences migration. Account deletion must use a server-side endpoint
-- with explicit password reauthentication, verified identity, and admin API.
begin;
create table if not exists public.tetherlume_preferences (
 user_id uuid primary key references auth.users(id) on delete cascade,
 orientation text not null default 'portrait' check (orientation in ('portrait','landscape'))
);
alter table public.tetherlume_preferences enable row level security;
revoke all on public.tetherlume_preferences from anon, authenticated;
grant select, insert, update, delete on public.tetherlume_preferences to authenticated;
drop policy if exists tetherlume_own_preferences on public.tetherlume_preferences;
create policy tetherlume_own_preferences on public.tetherlume_preferences for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop function if exists public.tetherlume_delete_own_account();
commit;
