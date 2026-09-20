-- Hamama portal — creating a project straight from the wizard.
--
-- A signed-in person creates a project through ONE function, in ONE transaction:
--   project row  +  their project_stewards row (owner, approved)  +  needs  +  offers.
-- If anything fails, everything is rolled back: there are never half-created projects.
--
-- Why a function and not open INSERT policies
--   * `authenticated` still has NO insert grant on projects, and the stewards policy still only allows
--     'steward'/'pending' rows. The only way to become an approved OWNER is to create the project here.
--   * The owner is always auth.uid(). There is no user-id parameter, so nobody can create a project
--     "for" somebody else.
--   * Moderation columns are fixed by the function (published / public / not a demo); a caller cannot
--     choose them, exactly as stewards cannot change them on edit.
--
-- Claiming an EXISTING project is unchanged: pending, approved by an admin.

-- LocalizedText = { "default"?: text, "translations": { "he"?: text, "en"?: text } } with some text in it.
create or replace function public.is_localized_text(v jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(v) = 'object'
     and nullif(btrim(coalesce(v ->> 'default', v -> 'translations' ->> 'he', v -> 'translations' ->> 'en', '')), '') is not null;
$$;

create or replace function public.create_project(
  p_project jsonb,
  p_needs   jsonb default '[]'::jsonb,
  p_offers  jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user  uuid := (select auth.uid());
  v_base  text := lower(btrim(coalesce(p_project ->> 'slug', '')));
  v_slug  text;
  v_n     integer := 1;
  v_id    uuid;
  r       public.projects;
  k       text;
begin
  if v_user is null then
    raise exception 'sign in to create a project' using errcode = '28000';
  end if;

  -- Shape checks: the app validates the same things, but this function is callable by any signed-in client.
  if jsonb_typeof(p_project) is distinct from 'object'
     or jsonb_typeof(p_needs) is distinct from 'array'
     or jsonb_typeof(p_offers) is distinct from 'array' then
    raise exception 'invalid project payload' using errcode = '22023';
  end if;
  if octet_length(p_project::text) + octet_length(p_needs::text) + octet_length(p_offers::text) > 200000
     or jsonb_array_length(p_needs) > 20 or jsonb_array_length(p_offers) > 20 then
    raise exception 'project payload too large' using errcode = '22023';
  end if;
  if v_base !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(v_base) > 80 then
    raise exception 'invalid slug' using errcode = '22023';
  end if;

  r := jsonb_populate_record(null::public.projects, p_project);
  foreach k in array array['name', 'tagline', 'short_description', 'vision', 'problem', 'desired_change'] loop
    if not public.is_localized_text(p_project -> k) then
      raise exception 'missing text: %', k using errcode = '22023';
    end if;
  end loop;
  if coalesce(cardinality(r.domains), 0) = 0 then
    raise exception 'a project needs at least one domain' using errcode = '22023';
  end if;

  -- The slug is the public identity. Never overwrite another project: take the first free one
  -- (name, name-2, name-3, …). ON CONFLICT DO NOTHING also waits out a concurrent creator and
  -- moves on, so two people creating "the same" project at once each get their own slug.
  -- "new" is the add-project route and is reserved by a check constraint.
  if v_base = 'new' then
    v_n := 2;
  end if;
  loop
    v_slug := case when v_n = 1 then v_base else v_base || '-' || v_n end;
    insert into public.projects (
      slug, name, tagline, short_description, vision, problem, desired_change, domains,
      lifecycle_stage, activity_status, location, collaboration_types, team, links,
      visibility, review_status, is_demo, created_by
    ) values (
      v_slug, r.name, r.tagline, r.short_description, r.vision, r.problem, r.desired_change, r.domains,
      r.lifecycle_stage, coalesce(r.activity_status, 'active'),
      nullif(r.location, 'null'::jsonb),
      coalesce(r.collaboration_types, '{}'), coalesce(nullif(r.team, 'null'::jsonb), '[]'::jsonb),
      coalesce(nullif(r.links, 'null'::jsonb), '{}'::jsonb),
      'public', 'published', false, v_user
    )
    on conflict (slug) do nothing
    returning id into v_id;

    exit when v_id is not null;
    v_n := v_n + 1;
    if v_n > 200 then
      raise exception 'could not find a free slug for %', v_base using errcode = '23505';
    end if;
  end loop;

  -- The creator is the approved owner, immediately.
  insert into public.project_stewards (project_id, user_id, role, status)
  values (v_id, v_user, 'owner', 'approved');

  insert into public.needs (project_id, position, type, title, description, keywords, status)
  select v_id, (e.ord - 1)::integer, n.type, nullif(n.title, 'null'::jsonb), n.description,
         coalesce(n.keywords, '{}'), 'open'
  from jsonb_array_elements(p_needs) with ordinality as e(item, ord),
       lateral jsonb_populate_record(null::public.needs, e.item) as n;

  insert into public.offers (project_id, position, type, title, description, keywords, status)
  select v_id, (e.ord - 1)::integer, o.type, nullif(o.title, 'null'::jsonb), o.description,
         coalesce(o.keywords, '{}'), 'active'
  from jsonb_array_elements(p_offers) with ordinality as e(item, ord),
       lateral jsonb_populate_record(null::public.offers, e.item) as o;

  return jsonb_build_object('id', v_id, 'slug', v_slug);
end;
$$;

-- Supabase grants EXECUTE on new functions to anon/authenticated by default; be explicit instead.
revoke all on function public.create_project(jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.create_project(jsonb, jsonb, jsonb) to authenticated;
