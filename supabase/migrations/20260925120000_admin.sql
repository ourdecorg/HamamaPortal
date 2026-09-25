-- Hamama portal — administrators and project administration.
--
-- Who is an admin lives in the database (public.admin_users), never in app code or environment variables.
-- A person is an admin exactly while they have a row with revoked_at IS NULL; public.is_admin() checks it on
-- every request, so a revoked admin loses access on their next request.
--
-- Every privileged operation is a SECURITY DEFINER function that checks is_admin() itself, so calling the
-- database directly with a normal session cannot bypass it. The app checks too, but the database decides.
--
-- Bootstrap: the first admin is added from a trusted machine (npm run admin -- --grant --email …, which uses the
-- service-role key) or in the Supabase SQL editor. There is no public way to become an admin.
--
-- Nothing existing is modified: no user, project or stewardship row changes. Projects get two nullable
-- columns (deleted_at, deleted_by) for soft deletion.

-- ------------------------------------------------------------ admin_users ---

-- One row per grant. Revoking sets revoked_at/revoked_by instead of deleting, so the table is also the
-- history of who gave and took away admin access, and when.
create table public.admin_users (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  granted_at  timestamptz not null default now(),
  granted_by  uuid references auth.users (id) on delete set null,   -- null: bootstrap (CLI / SQL editor)
  revoked_at  timestamptz,
  revoked_by  uuid references auth.users (id) on delete set null,
  constraint admin_users_revoked_after_granted check (revoked_at is null or revoked_at >= granted_at)
);

-- At most one ACTIVE grant per person; earlier, revoked grants stay as history.
create unique index admin_users_one_active_idx on public.admin_users (user_id) where revoked_at is null;

-- Is the current user an active admin? SECURITY DEFINER so policies and functions can call it; it only ever
-- answers for auth.uid(), so it reveals nothing about anybody else.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users a
    where a.user_id = (select auth.uid()) and a.revoked_at is null
  );
$$;

-- The system never ends up with zero admins — whoever makes the change (the app, the CLI, the SQL editor).
-- Revocations are serialised by a table lock, so two admins revoking each other at the same moment cannot
-- both succeed.
create or replace function public.admin_users_keep_one()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.revoked_at is null and (tg_op = 'DELETE' or new.revoked_at is not null) then
    lock table public.admin_users in share row exclusive mode;
    if not exists (select 1 from public.admin_users where revoked_at is null) then
      raise exception 'the last active admin cannot be removed' using errcode = 'HA004';
    end if;
  end if;
  return null;
end;
$$;

create trigger admin_users_keep_one
  after update or delete on public.admin_users
  for each row execute function public.admin_users_keep_one();

-- Nobody reads or writes this table directly from the app; the functions below are the only way in.
alter table public.admin_users enable row level security;
revoke all on public.admin_users from public, anon, authenticated;
grant all on public.admin_users to service_role;

-- ------------------------------------------------------------ soft delete ---

alter table public.projects
  add column deleted_at timestamptz,
  add column deleted_by uuid references auth.users (id) on delete set null;

-- A deleted project is invisible to the public and to its stewards (admins still see it, and can restore it).
drop policy projects_select on public.projects;
create policy projects_select on public.projects
  for select to anon, authenticated
  using (
    deleted_at is null
    and ((review_status = 'published' and visibility <> 'private') or public.is_project_editor(id))
  );

-- Stewards cannot edit a deleted project (this also covers its needs and offers).
create or replace function public.is_project_editor(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.project_stewards s
    join public.projects p on p.id = s.project_id
    where s.project_id = p_project_id
      and s.user_id = (select auth.uid())
      and s.status = 'approved'
      and p.deleted_at is null
  );
$$;

-- ------------------------------------------------ admins: projects content ---

-- Admins see every project (drafts, private, deleted) and may edit its CONTENT with the same column grants
-- as stewards. Moderation state and deletion go through the functions below.
create policy projects_select_admin on public.projects
  for select to authenticated
  using (public.is_admin());

create policy projects_update_admin on public.projects
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy needs_insert_admin on public.needs for insert to authenticated with check (public.is_admin());
create policy needs_update_admin on public.needs for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy needs_delete_admin on public.needs for delete to authenticated using (public.is_admin());
create policy offers_insert_admin on public.offers for insert to authenticated with check (public.is_admin());
create policy offers_update_admin on public.offers for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy offers_delete_admin on public.offers for delete to authenticated using (public.is_admin());

-- Needs/offers of hidden projects are visible to whoever can see the project (their select policies
-- already follow the project's visibility, which now includes admins).

-- -------------------------------------------------------- admin functions ---

create or replace function public.require_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  return (select auth.uid());
end;
$$;

-- Publication state of a project (only admins; stewards have no grant on these columns).
create or replace function public.admin_set_project_state(p_project_id uuid, p_review_status text, p_visibility text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  update public.projects
     set review_status = p_review_status, visibility = p_visibility
   where id = p_project_id;
  if not found then
    raise exception 'project not found' using errcode = 'HA005';
  end if;
end;
$$;

-- Soft delete: the project, its needs and offers disappear from the portal and from matching, but nothing is
-- destroyed — stewardships, opportunities and the slug stay, and an admin can restore it.
create or replace function public.admin_delete_project(p_project_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.require_admin();
begin
  update public.projects
     set deleted_at = now(), deleted_by = v_admin
   where id = p_project_id and deleted_at is null;
  if not found then
    raise exception 'project not found or already deleted' using errcode = 'HA005';
  end if;
end;
$$;

create or replace function public.admin_restore_project(p_project_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  update public.projects
     set deleted_at = null, deleted_by = null
   where id = p_project_id and deleted_at is not null;
  if not found then
    raise exception 'project not found or not deleted' using errcode = 'HA005';
  end if;
end;
$$;

-- Registered people, found by email or name, to choose a new admin from. Only admins may search.
create or replace function public.admin_search_users(p_query text)
returns table (user_id uuid, email text, display_name text, is_admin boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_query text := btrim(coalesce(p_query, ''));
  v_pattern text;
begin
  perform public.require_admin();
  if char_length(v_query) < 2 or char_length(v_query) > 200 then
    return;
  end if;
  v_pattern := '%' || replace(replace(replace(lower(v_query), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return query
    select u.id, u.email::text, p.display_name,
           exists (select 1 from public.admin_users a where a.user_id = u.id and a.revoked_at is null)
    from auth.users u
    left join public.profiles p on p.id = u.id
    where lower(coalesce(u.email, '')) like v_pattern
       or lower(coalesce(p.display_name, '')) like v_pattern
    order by u.email
    limit 20;
end;
$$;

-- Every grant, active and revoked, with who granted / revoked it.
create or replace function public.admin_list()
returns table (
  id uuid,
  user_id uuid,
  email text,
  display_name text,
  granted_at timestamptz,
  granted_by uuid,
  granted_by_email text,
  granted_by_name text,
  revoked_at timestamptz,
  revoked_by uuid,
  revoked_by_email text,
  revoked_by_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return query
    select a.id, a.user_id, u.email::text, p.display_name,
           a.granted_at, a.granted_by, gu.email::text, gp.display_name,
           a.revoked_at, a.revoked_by, ru.email::text, rp.display_name
    from public.admin_users a
    left join auth.users u       on u.id = a.user_id
    left join public.profiles p  on p.id = a.user_id
    left join auth.users gu      on gu.id = a.granted_by
    left join public.profiles gp on gp.id = a.granted_by
    left join auth.users ru      on ru.id = a.revoked_by
    left join public.profiles rp on rp.id = a.revoked_by
    order by a.revoked_at is not null, a.granted_at;
end;
$$;

create or replace function public.admin_grant(p_user_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.require_admin();
  v_id uuid;
begin
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'no such user' using errcode = 'HA001';
  end if;
  insert into public.admin_users (user_id, granted_by)
  values (p_user_id, v_admin)
  on conflict (user_id) where revoked_at is null do nothing
  returning id into v_id;
  if v_id is null then
    raise exception 'already an admin' using errcode = 'HA002';
  end if;
  return v_id;
end;
$$;

-- Revoke someone's admin access (possibly your own). The account itself is untouched. Refused when it would
-- leave no active admin — which also means nobody can revoke themselves while they are the only admin.
create or replace function public.admin_revoke(p_user_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.require_admin();
begin
  lock table public.admin_users in share row exclusive mode;
  if not exists (select 1 from public.admin_users where user_id = p_user_id and revoked_at is null) then
    raise exception 'not an active admin' using errcode = 'HA003';
  end if;
  if not exists (select 1 from public.admin_users where user_id <> p_user_id and revoked_at is null) then
    raise exception 'the last active admin cannot be removed' using errcode = 'HA004';
  end if;
  update public.admin_users
     set revoked_at = now(), revoked_by = v_admin
   where user_id = p_user_id and revoked_at is null;
end;
$$;

-- Supabase grants EXECUTE on new functions to anon/authenticated by default; be explicit instead.
revoke all on function public.is_admin() from public, anon, authenticated;
revoke all on function public.require_admin() from public, anon, authenticated;
revoke all on function public.admin_users_keep_one() from public, anon, authenticated;
revoke all on function public.admin_set_project_state(uuid, text, text) from public, anon, authenticated;
revoke all on function public.admin_delete_project(uuid) from public, anon, authenticated;
revoke all on function public.admin_restore_project(uuid) from public, anon, authenticated;
revoke all on function public.admin_search_users(text) from public, anon, authenticated;
revoke all on function public.admin_list() from public, anon, authenticated;
revoke all on function public.admin_grant(uuid) from public, anon, authenticated;
revoke all on function public.admin_revoke(uuid) from public, anon, authenticated;

-- is_admin() runs inside policies that also apply to anon (it answers false for them).
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.admin_set_project_state(uuid, text, text) to authenticated;
grant execute on function public.admin_delete_project(uuid) to authenticated;
grant execute on function public.admin_restore_project(uuid) to authenticated;
grant execute on function public.admin_search_users(text) to authenticated;
grant execute on function public.admin_list() to authenticated;
grant execute on function public.admin_grant(uuid) to authenticated;
grant execute on function public.admin_revoke(uuid) to authenticated;
