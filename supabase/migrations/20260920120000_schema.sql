-- Hamama portal — persistent schema (tables, indexes, triggers).
-- Row Level Security and grants live in the next migration (20260920120100_rls.sql).
--
-- Design notes
--  * Supabase Auth (auth.users) is the source of truth for identity. `profiles` only
--    holds public application data and never duplicates credentials or the email.
--  * The rich, bilingual project model from the JSON files is kept as JSONB
--    ({ default, translations: { he, en } }) instead of being split into dozens of tables.
--  * Needs and Offers are real rows (they are what people act on and what matching reads).
--  * Everything the app runs on is created by migrations; nothing depends on manual edits.

-- ---------------------------------------------------------------- helpers ---

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- --------------------------------------------------------------- profiles ---

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- A profile row is created automatically for every new auth user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), ''),
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture', '')), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Users that already exist when this migration runs.
insert into public.profiles (id, display_name, avatar_url)
select
  u.id,
  nullif(btrim(coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', '')), ''),
  nullif(btrim(coalesce(u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture', '')), '')
from auth.users u
on conflict (id) do nothing;

-- --------------------------------------------------------------- projects ---

create table public.projects (
  id                  uuid primary key default gen_random_uuid(),
  -- The slug is the public identity: /projects/<slug> URLs must never change.
  slug                text not null unique
                        check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and slug <> 'new'),

  -- LocalizedText: { "default"?: text, "translations": { "he"?: text, "en"?: text } }
  name                jsonb not null,
  tagline             jsonb not null,
  short_description   jsonb not null,
  vision              jsonb not null,   -- the "future world" text
  problem             jsonb not null,   -- the primary problem text
  desired_change      jsonb not null,

  domains             text[] not null default '{}',
  lifecycle_stage     text not null
                        check (lifecycle_stage in ('idea', 'exploration', 'prototype', 'pilot', 'operating', 'scaling')),
  activity_status     text not null default 'active'
                        check (activity_status in ('active', 'forming', 'paused')),
  location            jsonb,            -- { scope: local|national|global|remote, place?: LocalizedText }
  collaboration_types text[] not null default '{}',
  team                jsonb not null default '[]'::jsonb,   -- people shown on the page: [{ name, role?, bio? }]
  links               jsonb not null default '{}'::jsonb,   -- { website, linkedin, github }

  visibility          text not null default 'public'
                        check (visibility in ('public', 'unlisted', 'private')),
  review_status       text not null default 'pending_review'
                        check (review_status in ('draft', 'pending_review', 'published')),
  is_demo             boolean not null default false,

  created_by          uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index projects_listing_idx on public.projects (review_status, visibility);
create index projects_domains_idx on public.projects using gin (domains);

create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------- project_stewards ---

create table public.project_stewards (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null default 'steward' check (role in ('owner', 'steward')),
  status     text not null default 'pending' check (status in ('pending', 'approved')),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create index project_stewards_user_idx on public.project_stewards (user_id, status);

-- Is the current user an APPROVED owner/steward of the project?
-- SECURITY DEFINER so that policies on project_stewards itself can call it without recursing.
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
    where s.project_id = p_project_id
      and s.user_id = (select auth.uid())
      and s.status = 'approved'
  );
$$;

-- ---------------------------------------------------------- needs / offers ---

create table public.needs (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  -- Stable key from the seed data ("need-1"). Makes the import idempotent.
  key         text,
  position    integer not null default 0,
  type        text not null check (type ~ '^[a-z][a-z0-9_]*$'),
  title       jsonb,                    -- LocalizedText, optional short label
  description jsonb not null,           -- LocalizedText
  keywords    text[] not null default '{}',
  status      text not null default 'open' check (status in ('open', 'in_conversation', 'fulfilled')),
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint needs_project_key_key unique (project_id, key)
);

create index needs_project_idx on public.needs (project_id, position);
create index needs_open_idx on public.needs (status) where status = 'open';

create trigger needs_set_updated_at
  before update on public.needs
  for each row execute function public.set_updated_at();

create table public.offers (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  key         text,
  position    integer not null default 0,
  type        text not null check (type ~ '^[a-z][a-z0-9_]*$'),
  title       jsonb,
  description jsonb not null,
  keywords    text[] not null default '{}',
  -- Reserved: the matching engine does not filter on it yet.
  status      text not null default 'active' check (status in ('active', 'paused')),
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint offers_project_key_key unique (project_id, key)
);

create index offers_project_idx on public.offers (project_id, position);

create trigger offers_set_updated_at
  before update on public.offers
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------- wishes ---

create table public.wishes (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  text            text not null check (char_length(btrim(text)) between 1 and 2000),
  -- Progressive disclosure: everything below is optional.
  desired_outcome text check (desired_outcome is null or char_length(desired_outcome) <= 1500),
  domains         text[] not null default '{}',
  location_scope  text check (location_scope is null or location_scope in ('local', 'national', 'global', 'remote')),
  time_horizon    text check (time_horizon is null or char_length(time_horizon) <= 200),
  visibility      text not null default 'private' check (visibility in ('private', 'public')),
  status          text not null default 'open'
                    check (status in ('open', 'exploring', 'connected', 'in_progress', 'fulfilled', 'archived')),
  -- What the engine understood when the wish was saved (topics, intent, matched projects and why).
  interpretation  jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index wishes_user_status_idx on public.wishes (user_id, status);
create index wishes_public_idx on public.wishes (created_at desc) where visibility = 'public';

create trigger wishes_set_updated_at
  before update on public.wishes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------- opportunities ---

-- A connection somebody chose to act on. One row per requesting person per connection,
-- so each person only ever edits their own row. Entities are typed so that later
-- versions can connect wishes or several parties without a schema change.
create table public.opportunities (
  id                 uuid primary key default gen_random_uuid(),
  source_entity_type text not null check (source_entity_type in ('project', 'wish')),
  source_entity_id   uuid not null,      -- for a need/offer connection: the project that has the NEED
  target_entity_type text not null check (target_entity_type in ('project', 'wish')),
  target_entity_id   uuid not null,      -- ... and the project that has the OFFER
  need_id            uuid references public.needs (id) on delete set null,
  offer_id           uuid references public.offers (id) on delete set null,
  rationale          text not null default '',
  unknowns           jsonb not null default '[]'::jsonb,
  -- A UI hint carried over from the matching engine. Never shown as a number.
  confidence         numeric(3, 2) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  status             text not null default 'suggested'
                       check (status in ('suggested', 'interested', 'intro_requested', 'in_progress', 'closed')),
  requested_by       uuid references auth.users (id) on delete cascade,
  created_by         uuid references auth.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint opportunities_one_per_requester
    unique nulls not distinct (
      source_entity_type, source_entity_id, target_entity_type, target_entity_id,
      need_id, offer_id, requested_by
    )
);

create index opportunities_status_idx on public.opportunities (status);
create index opportunities_requested_by_idx on public.opportunities (requested_by, status);
create index opportunities_source_idx on public.opportunities (source_entity_type, source_entity_id);
create index opportunities_target_idx on public.opportunities (target_entity_type, target_entity_id);

create trigger opportunities_set_updated_at
  before update on public.opportunities
  for each row execute function public.set_updated_at();
