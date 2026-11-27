-- Review and execute in Supabase SQL Editor before enabling these features.
begin;
create table if not exists public.tetherlume_preferences (
 user_id uuid primary key references auth.users(id) on delete cascade,
 orientation text not null default 'portrait' check (orientation in ('portrait','landscape'))
);
alter table public.tetherlume_preferences enable row level security;
revoke all on public.tetherlume_preferences from anon, authenticated;
grant select, insert, update, delete on public.tetherlume_preferences to authenticated;
create policy tetherlume_own_preferences on public.tetherlume_preferences for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create or replace function public.tetherlume_delete_own_account()
returns void language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if coalesce((auth.jwt()->>'iat')::bigint,0) < extract(epoch from now())-300 then raise exception 'Recent authentication required'; end if;
 delete from auth.users where id = auth.uid();
end;
$$;
revoke all on function public.tetherlume_delete_own_account() from public, anon, authenticated;
grant execute on function public.tetherlume_delete_own_account() to authenticated;
commit;
