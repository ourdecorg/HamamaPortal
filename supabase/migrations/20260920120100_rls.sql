-- Hamama portal — grants and Row Level Security.
--
-- Two layers, both explicit (nothing relies on Supabase's default grants):
--   1. GRANTs decide which operations and which COLUMNS a role may touch at all.
--   2. RLS policies decide which ROWS.
--
-- Roles: `anon` = signed-out visitor, `authenticated` = signed-in user,
-- `service_role` = the seed/approve CLI scripts only (bypasses RLS, never used by the web app).
--
-- Approval of stewards is deliberately NOT possible from the app: there is no UPDATE grant on
-- project_stewards. An admin approves with the service role (npm run steward:approve) or SQL.

alter table public.profiles         enable row level security;
alter table public.projects         enable row level security;
alter table public.project_stewards enable row level security;
alter table public.needs            enable row level security;
alter table public.offers           enable row level security;
alter table public.wishes           enable row level security;
alter table public.opportunities    enable row level security;

-- ----------------------------------------------------------------- grants ---

revoke all on public.profiles, public.projects, public.project_stewards, public.needs,
              public.offers, public.wishes, public.opportunities
  from anon, authenticated;

-- Public read of the catalogue (rows are still filtered by the policies below).
grant select on public.projects, public.needs, public.offers to anon, authenticated;

-- Profiles: read and edit only your own (policies), and only the public-facing columns.
grant select on public.profiles to authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;

-- Projects: stewards may change CONTENT columns only. slug, review_status, visibility,
-- is_demo and created_by can only be changed by an admin.
grant update (
  name, tagline, short_description, vision, problem, desired_change, domains,
  lifecycle_stage, activity_status, location, collaboration_types, team, links
) on public.projects to authenticated;

-- Needs / offers: full edit for approved stewards (policies).
grant insert, update, delete on public.needs, public.offers to authenticated;

-- Stewardship requests: request (insert), see (select) and withdraw (delete). No update.
grant select, insert, delete on public.project_stewards to authenticated;

-- Wishes: public ones are readable by anyone, everything else by the owner.
grant select on public.wishes to anon, authenticated;
grant insert, update, delete on public.wishes to authenticated;

-- Opportunities: read own / involved, create own, and move only the status of own rows.
grant select, insert on public.opportunities to authenticated;
grant update (status) on public.opportunities to authenticated;

-- --------------------------------------------------------------- profiles ---

create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- --------------------------------------------------------------- projects ---

-- Everyone sees published, non-private projects. Approved stewards also see their own
-- drafts / private projects.
create policy projects_select on public.projects
  for select to anon, authenticated
  using (
    (review_status = 'published' and visibility <> 'private')
    or public.is_project_editor(id)
  );

create policy projects_update_by_steward on public.projects
  for update to authenticated
  using (public.is_project_editor(id))
  with check (public.is_project_editor(id));

-- -------------------------------------------------------- project_stewards ---

-- You see your own requests; approved stewards also see who else looks after their project.
create policy stewards_select on public.project_stewards
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_project_editor(project_id));

-- You may ONLY ask to become a steward of a project you can see: role 'steward', status 'pending'.
create policy stewards_request_own on public.project_stewards
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and role = 'steward'
    and status = 'pending'
    and exists (select 1 from public.projects p where p.id = project_id)
  );

-- You may withdraw a request that is still pending.
create policy stewards_withdraw_pending on public.project_stewards
  for delete to authenticated
  using (user_id = (select auth.uid()) and status = 'pending');

-- ---------------------------------------------------------- needs / offers ---

-- A need/offer is visible exactly when its project is (the subquery is itself subject to RLS).
create policy needs_select on public.needs
  for select to anon, authenticated
  using (exists (select 1 from public.projects p where p.id = needs.project_id));

create policy needs_insert_by_steward on public.needs
  for insert to authenticated
  with check (public.is_project_editor(project_id));

create policy needs_update_by_steward on public.needs
  for update to authenticated
  using (public.is_project_editor(project_id))
  with check (public.is_project_editor(project_id));

create policy needs_delete_by_steward on public.needs
  for delete to authenticated
  using (public.is_project_editor(project_id));

create policy offers_select on public.offers
  for select to anon, authenticated
  using (exists (select 1 from public.projects p where p.id = offers.project_id));

create policy offers_insert_by_steward on public.offers
  for insert to authenticated
  with check (public.is_project_editor(project_id));

create policy offers_update_by_steward on public.offers
  for update to authenticated
  using (public.is_project_editor(project_id))
  with check (public.is_project_editor(project_id));

create policy offers_delete_by_steward on public.offers
  for delete to authenticated
  using (public.is_project_editor(project_id));

-- ----------------------------------------------------------------- wishes ---

create policy wishes_select on public.wishes
  for select to anon, authenticated
  using (visibility = 'public' or user_id = (select auth.uid()));

create policy wishes_insert_own on public.wishes
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy wishes_update_own on public.wishes
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy wishes_delete_own on public.wishes
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------- opportunities ---

-- Who can see an opportunity: the person who requested / created it, and approved stewards
-- of the projects on either side (so they can see who is interested in them).
create policy opportunities_select on public.opportunities
  for select to authenticated
  using (
    requested_by = (select auth.uid())
    or created_by = (select auth.uid())
    or (source_entity_type = 'project' and public.is_project_editor(source_entity_id))
    or (target_entity_type = 'project' and public.is_project_editor(target_entity_id))
  );

-- You may only create an opportunity as yourself, as "interested", about real, visible projects,
-- and the need/offer must really belong to the projects it names.
create policy opportunities_insert_own on public.opportunities
  for insert to authenticated
  with check (
    requested_by = (select auth.uid())
    and created_by = (select auth.uid())
    and status = 'interested'
    and (
      source_entity_type <> 'project'
      or exists (select 1 from public.projects p where p.id = source_entity_id)
    )
    and (
      target_entity_type <> 'project'
      or exists (select 1 from public.projects p where p.id = target_entity_id)
    )
    and (
      need_id is null
      or exists (select 1 from public.needs n where n.id = need_id and n.project_id = source_entity_id)
    )
    and (
      offer_id is null
      or exists (select 1 from public.offers o where o.id = offer_id and o.project_id = target_entity_id)
    )
  );

-- You may move your OWN opportunity between the human-controlled statuses (column grant: status only).
create policy opportunities_update_own_status on public.opportunities
  for update to authenticated
  using (requested_by = (select auth.uid()))
  with check (
    requested_by = (select auth.uid())
    and status in ('interested', 'intro_requested', 'closed')
  );
