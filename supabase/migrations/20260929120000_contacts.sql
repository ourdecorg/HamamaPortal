-- Hamama portal — people can contact each other.
--
--   * Every person on an initiative's team has a stable id (projects.team[].id) and, privately, an email
--     (public.project_contacts). The team list is public; the emails are NEVER readable by visitors or by the
--     people who contact them — not through a table, a function or an email header.
--   * Conversations are either "email" (delivered to inboxes, replies come back into the thread) or "chat"
--     (between two registered people, inside the portal). Both live in the same three tables.
--   * The web app has no service-role key. Everything a person does runs with their own session through the
--     SECURITY DEFINER functions below, which check who is asking. Outgoing email is queued in
--     public.mail_outbox; only the mail worker (the app's server, holding MAIL_WORKER_SECRET, whose hash is
--     stored in private.app_secrets) can read the queue — with the addresses — and record incoming replies.
--
-- Existing data: team entries get an id ("person-1", "person-2", …) and nothing else changes. People without an
-- email simply cannot be contacted until a steward adds one.

-- ------------------------------------------------------------ team ids ----

-- Backfilled without touching updated_at ("last updated" on the page stays true). A member with no id gets
-- "person-<position>", or — if another member already has that id — "person-<position>-<suffix>".
alter table public.projects disable trigger projects_set_updated_at;
update public.projects p
   set team = (
     select coalesce(
       jsonb_agg(
         case when jsonb_typeof(e.item -> 'id') = 'string' then e.item
              else e.item || jsonb_build_object('id',
                case when exists (select 1 from jsonb_array_elements(p.team) y where y ->> 'id' = 'person-' || e.ord)
                     then 'person-' || e.ord || '-' || left(md5(p.id::text || e.ord), 6)
                     else 'person-' || e.ord end) end
         order by e.ord),
       '[]'::jsonb)
     from jsonb_array_elements(p.team) with ordinality as e(item, ord)
   )
 where jsonb_typeof(p.team) = 'array'
   and exists (select 1 from jsonb_array_elements(p.team) x where jsonb_typeof(x -> 'id') is distinct from 'string');
alter table public.projects enable trigger projects_set_updated_at;

-- The ids of the people on a team.
create or replace function public.team_person_ids(p_team jsonb)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(x ->> 'id'), '{}')
  from jsonb_array_elements(case when jsonb_typeof(p_team) = 'array' then p_team else '[]'::jsonb end) x
  where jsonb_typeof(x -> 'id') = 'string';
$$;

create or replace function public.team_person_name(p_team jsonb, p_person_id text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(btrim(x ->> 'name'), '')
  from jsonb_array_elements(case when jsonb_typeof(p_team) = 'array' then p_team else '[]'::jsonb end) x
  where x ->> 'id' = p_person_id
  limit 1;
$$;

-- ----------------------------------------------------------- identities ---

-- The signed-in person's confirmed email (lower case), or null.
create or replace function public.my_email()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select lower(u.email::text) from auth.users u
  where u.id = (select auth.uid()) and u.email_confirmed_at is not null;
$$;

-- The registered account that owns this email (confirmed), or null.
create or replace function public.user_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id from auth.users u
  where lower(u.email::text) = lower(btrim(p_email)) and u.email_confirmed_at is not null
  order by u.created_at nulls last
  limit 1;
$$;

-- How a registered person is called in conversations: their profile name, else the start of their email.
create or replace function public.person_display_name(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select left(coalesce(nullif(btrim(p.display_name), ''), nullif(split_part(u.email::text, '@', 1), ''), '—'), 120)
  from auth.users u left join public.profiles p on p.id = u.id
  where u.id = p_user_id;
$$;

-- Can the caller see this project (the same rule as the projects_select policies)?
create or replace function public.can_see_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.projects p
    where p.id = p_project_id
      and (
        (p.deleted_at is null and ((p.review_status = 'published' and p.visibility <> 'private') or public.is_project_editor(p.id)))
        or public.is_admin()
      )
  );
$$;

-- ------------------------------------------------------ project_contacts ---

create table public.project_contacts (
  project_id    uuid not null references public.projects (id) on delete cascade,
  person_id     text not null check (person_id ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  email         text not null check (
                  email = lower(btrim(email)) and char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  -- In the "you were listed on an initiative" notice: lets the person stop being contactable.
  stop_token    uuid not null default gen_random_uuid() unique,
  opted_out_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (project_id, person_id)
);

create index project_contacts_email_idx on public.project_contacts (email);

create trigger project_contacts_set_updated_at
  before update on public.project_contacts
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------ conversations ---

create table public.conversations (
  id               uuid primary key default gen_random_uuid(),
  kind             text not null check (kind in ('email', 'chat')),
  -- The initiative and the team member it started from (context; survives the project being deleted).
  project_id       uuid references public.projects (id) on delete set null,
  person_id        text,
  subject          text check (subject is null or char_length(subject) <= 200),
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  last_message_at  timestamptz not null default now()
);

create index conversations_contact_idx on public.conversations (project_id, person_id, kind);

-- A participant is a registered person (user_id) or, for email, an address (email). Registered people are
-- matched by user_id; an address participant who later signs up with that address sees the conversation too.
create table public.conversation_participants (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.conversations (id) on delete cascade,
  user_id          uuid references auth.users (id) on delete cascade,
  email            text check (email is null or email = lower(btrim(email))),
  display_name     text not null check (char_length(display_name) between 1 and 120),
  -- Secret: the participant's reply address (reply+<token>@…) and "stop" link. Never leaves the database
  -- except to the mail worker.
  reply_token      uuid not null default gen_random_uuid() unique,
  last_read_at     timestamptz,
  muted_at         timestamptz,
  created_at       timestamptz not null default now(),
  constraint conversation_participants_identity check (user_id is not null or email is not null),
  unique (conversation_id, user_id)
);

create index conversation_participants_user_idx on public.conversation_participants (user_id);
create index conversation_participants_email_idx on public.conversation_participants (email);

create table public.messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.conversations (id) on delete cascade,
  participant_id   uuid references public.conversation_participants (id) on delete set null,
  body             text not null check (char_length(btrim(body)) between 1 and 10000),
  via              text not null default 'app' check (via in ('app', 'email')),
  -- The provider's id of an incoming email: the same reply is never stored twice.
  inbound_id       text unique,
  created_at       timestamptz not null default now()
);

create index messages_conversation_idx on public.messages (conversation_id, created_at);

-- --------------------------------------------------------------- outbox ---

-- notice:  someone listed you (project_id, person_id) on an initiative
-- message: a message of an email conversation, to one participant's inbox
-- notify:  "you have a new chat message", at most one until the participant reads the conversation
create table public.mail_outbox (
  id               uuid primary key default gen_random_uuid(),
  kind             text not null check (kind in ('notice', 'message', 'notify')),
  locale           text not null default 'he' check (locale in ('he', 'en')),
  project_id       uuid references public.projects (id) on delete cascade,
  person_id        text,
  conversation_id  uuid references public.conversations (id) on delete cascade,
  message_id       uuid references public.messages (id) on delete cascade,
  participant_id   uuid references public.conversation_participants (id) on delete cascade,
  created_at       timestamptz not null default now(),
  attempts         integer not null default 0,
  claimed_at       timestamptz,
  sent_at          timestamptz,
  failed_at        timestamptz,
  last_error       text
);

create index mail_outbox_pending_idx on public.mail_outbox (created_at) where sent_at is null and failed_at is null;

-- -------------------------------------------------------------- secrets ---

create schema if not exists private;
revoke all on schema private from public;

-- sha256 (hex) of secrets the app's server holds. Set in the SQL editor (docs/SUPABASE.md):
--   insert into private.app_secrets (name, hash) values ('mail_worker', encode(sha256(convert_to('<secret>', 'UTF8')), 'hex'))
--   on conflict (name) do update set hash = excluded.hash;
create table private.app_secrets (
  name  text primary key,
  hash  text not null
);

create or replace function public.mail_worker_ok(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(char_length(p_secret) >= 32, false)
     and exists (
       select 1 from private.app_secrets s
       where s.name = 'mail_worker' and s.hash = encode(sha256(convert_to(p_secret, 'UTF8')), 'hex')
     );
$$;

-- ------------------------------------------------------------------ RLS ---

-- Nobody reads or writes these tables directly from the app: the functions below are the only way in.
alter table public.project_contacts           enable row level security;
alter table public.conversations              enable row level security;
alter table public.conversation_participants  enable row level security;
alter table public.messages                   enable row level security;
alter table public.mail_outbox                enable row level security;

revoke all on public.project_contacts, public.conversations, public.conversation_participants,
              public.messages, public.mail_outbox
  from public, anon, authenticated;
grant all on public.project_contacts, public.conversations, public.conversation_participants,
             public.messages, public.mail_outbox
  to service_role;

-- ------------------------------------------------------ team contacts: API ---

-- Who on a visible project's team can be contacted, and how. Never an email: only "registered" (a confirmed
-- account uses this address), "contactable" (has an email and did not opt out) and "is_me".
create or replace function public.project_people(p_project_id uuid)
returns table (person_id text, registered boolean, contactable boolean, is_me boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select c.person_id,
         r.id is not null,
         c.opted_out_at is null,
         coalesce(r.id = (select auth.uid()), false)
  from public.project_contacts c
  join public.projects p on p.id = c.project_id
  left join lateral (select public.user_by_email(c.email) as id) r on true
  where c.project_id = p_project_id
    and public.can_see_project(p_project_id)
    and c.person_id = any (public.team_person_ids(p.team));
$$;

-- The team's emails, for the project's approved stewards and admins (the edit form). Anyone else: nothing.
create or replace function public.project_contact_emails(p_project_id uuid)
returns table (person_id text, email text, opted_out boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select c.person_id, c.email, c.opted_out_at is not null
  from public.project_contacts c
  where c.project_id = p_project_id
    and (public.is_project_editor(p_project_id) or public.is_admin());
$$;

-- Replace a project's contacts with `p_contacts` ([{ person_id, email }]). INTERNAL: callers check rights.
-- A new or changed address gets a notice email (unless it is the caller's own) and can be contacted again.
create or replace function public.apply_project_contacts(p_project_id uuid, p_contacts jsonb, p_locale text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_team   text[];
  v_me     text := public.my_email();
  v_locale text := case when p_locale in ('he', 'en') then p_locale else 'he' end;
  v_seen   text[] := '{}';
  v_old    text;
  e        jsonb;
  v_pid    text;
  v_email  text;
begin
  if jsonb_typeof(p_contacts) is distinct from 'array' or jsonb_array_length(p_contacts) > 30 then
    raise exception 'invalid contacts' using errcode = '22023';
  end if;
  select public.team_person_ids(p.team) into v_team from public.projects p where p.id = p_project_id;
  if v_team is null then
    raise exception 'project not found' using errcode = 'P0002';
  end if;

  for e in select * from jsonb_array_elements(p_contacts) loop
    v_pid := e ->> 'person_id';
    v_email := lower(btrim(coalesce(e ->> 'email', '')));
    if v_pid is null or not (v_pid = any (v_team)) or v_pid = any (v_seen) then
      raise exception 'contact for an unknown person' using errcode = '22023';
    end if;
    if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then
      raise exception 'invalid email' using errcode = '22023';
    end if;
    v_seen := v_seen || v_pid;

    select c.email into v_old from public.project_contacts c where c.project_id = p_project_id and c.person_id = v_pid;
    if v_old is null then
      insert into public.project_contacts (project_id, person_id, email) values (p_project_id, v_pid, v_email);
    elsif v_old <> v_email then
      update public.project_contacts
         set email = v_email, opted_out_at = null, stop_token = gen_random_uuid()
       where project_id = p_project_id and person_id = v_pid;
    else
      continue;
    end if;

    if v_email is distinct from v_me then
      insert into public.mail_outbox (kind, locale, project_id, person_id) values ('notice', v_locale, p_project_id, v_pid);
    end if;
  end loop;

  delete from public.project_contacts c
   where c.project_id = p_project_id and not (c.person_id = any (v_seen));
end;
$$;

-- For a project's approved stewards and admins (the edit form's save).
create or replace function public.set_project_contacts(p_project_id uuid, p_contacts jsonb, p_locale text default 'he')
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'sign in first' using errcode = '28000';
  end if;
  if not (public.is_project_editor(p_project_id) or public.is_admin()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  perform public.apply_project_contacts(p_project_id, p_contacts, p_locale);
end;
$$;

-- ------------------------------------------------- create_project (again) ---

-- Same as before (20260920130000_create_project.sql) plus the team's emails, in the same transaction.
drop function if exists public.create_project(jsonb, jsonb, jsonb);

create or replace function public.create_project(
  p_project  jsonb,
  p_needs    jsonb default '[]'::jsonb,
  p_offers   jsonb default '[]'::jsonb,
  p_contacts jsonb default '[]'::jsonb,
  p_locale   text  default 'he'
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

  if jsonb_typeof(p_project) is distinct from 'object'
     or jsonb_typeof(p_needs) is distinct from 'array'
     or jsonb_typeof(p_offers) is distinct from 'array'
     or jsonb_typeof(p_contacts) is distinct from 'array' then
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

  perform public.apply_project_contacts(v_id, p_contacts, p_locale);

  return jsonb_build_object('id', v_id, 'slug', v_slug);
end;
$$;

-- -------------------------------------------------- conversations: helpers ---

-- The caller's participant row in a conversation, or null.
create or replace function public.my_participant(p_conversation_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select cp.id from public.conversation_participants cp
  where cp.conversation_id = p_conversation_id
    and (cp.user_id = (select auth.uid()) or (cp.user_id is null and cp.email = public.my_email()))
  order by cp.user_id is null
  limit 1;
$$;

-- Queue the deliveries of a new message. INTERNAL.
--   email conversations: the message itself, to every other participant's inbox
--   chat:                one "you have a new message" note per participant until they read the conversation
create or replace function public.enqueue_message(p_message_id uuid, p_locale text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_locale text := case when p_locale in ('he', 'en') then p_locale else 'he' end;
  m public.messages;
  c public.conversations;
begin
  select * into m from public.messages where id = p_message_id;
  select * into c from public.conversations where id = m.conversation_id;

  if c.kind = 'email' then
    insert into public.mail_outbox (kind, locale, conversation_id, message_id, participant_id)
    select 'message', v_locale, c.id, m.id, cp.id
    from public.conversation_participants cp
    where cp.conversation_id = c.id and cp.id is distinct from m.participant_id and cp.muted_at is null;
  else
    insert into public.mail_outbox (kind, locale, conversation_id, message_id, participant_id)
    select 'notify', v_locale, c.id, m.id, cp.id
    from public.conversation_participants cp
    where cp.conversation_id = c.id and cp.id is distinct from m.participant_id and cp.muted_at is null
      and not exists (
        select 1 from public.mail_outbox o
        where o.kind = 'notify' and o.participant_id = cp.id
          and o.created_at > coalesce(cp.last_read_at, '-infinity'::timestamptz)
      );
  end if;
end;
$$;

-- ---------------------------------------------------- conversations: API ---

-- Contact a person on an initiative's team: the first message of a conversation, or — if the caller already has
-- one of this kind with this person — the next message in it. Returns the conversation id.
create or replace function public.start_conversation(
  p_project_id uuid,
  p_person_id  text,
  p_kind       text,
  p_subject    text,
  p_body       text,
  p_locale     text default 'he'
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user     uuid := (select auth.uid());
  v_body     text := btrim(coalesce(p_body, ''));
  v_subject  text := nullif(btrim(coalesce(p_subject, '')), '');
  v_contact  public.project_contacts;
  v_team     jsonb;
  v_name     text;
  v_target   uuid;
  v_conv     uuid;
  v_me       uuid;
  v_msg      uuid;
begin
  if v_user is null then
    raise exception 'sign in first' using errcode = '28000';
  end if;
  if p_kind not in ('email', 'chat') then
    raise exception 'invalid kind' using errcode = '22023';
  end if;
  if char_length(v_body) not between 1 and 5000 then
    raise exception 'invalid message' using errcode = '22023';
  end if;
  if p_kind = 'email' and (v_subject is null or char_length(v_subject) > 200) then
    raise exception 'invalid subject' using errcode = '22023';
  end if;

  select p.team into v_team from public.projects p
   where p.id = p_project_id and p.deleted_at is null and public.can_see_project(p.id);
  select * into v_contact from public.project_contacts c
   where c.project_id = p_project_id and c.person_id = p_person_id;
  v_name := public.team_person_name(v_team, p_person_id);
  if v_team is null or v_contact.person_id is null or v_name is null then
    raise exception 'this person cannot be contacted' using errcode = 'P0002';
  end if;
  if v_contact.opted_out_at is not null then
    raise exception 'this person asked not to be contacted' using errcode = 'HA101';
  end if;

  v_target := public.user_by_email(v_contact.email);
  if v_target = v_user then
    raise exception 'you cannot contact yourself' using errcode = 'HA102';
  end if;
  if p_kind = 'chat' and v_target is null then
    raise exception 'chat needs a registered person' using errcode = 'HA103';
  end if;

  -- An existing conversation of this kind with this person continues.
  select c.id into v_conv
    from public.conversations c
    join public.conversation_participants cp on cp.conversation_id = c.id and cp.user_id = v_user
   where c.project_id = p_project_id and c.person_id = p_person_id and c.kind = p_kind
   order by c.last_message_at desc
   limit 1;

  if v_conv is null then
    if (select count(*) from public.conversations c
         where c.created_by = v_user and c.created_at > now() - interval '1 day') >= 20 then
      raise exception 'too many new conversations today' using errcode = 'HA104';
    end if;

    insert into public.conversations (kind, project_id, person_id, subject, created_by)
    values (p_kind, p_project_id, p_person_id, case when p_kind = 'email' then v_subject end, v_user)
    returning id into v_conv;

    insert into public.conversation_participants (conversation_id, user_id, display_name)
    values (v_conv, v_user, public.person_display_name(v_user));

    insert into public.conversation_participants (conversation_id, user_id, email, display_name)
    values (v_conv, v_target, case when v_target is null then v_contact.email end, left(v_name, 120));
  end if;

  v_me := public.my_participant(v_conv);
  if (select count(*) from public.messages m
        join public.conversation_participants cp on cp.id = m.participant_id
       where cp.user_id = v_user and m.created_at > now() - interval '1 hour') >= 120 then
    raise exception 'too many messages' using errcode = 'HA104';
  end if;

  insert into public.messages (conversation_id, participant_id, body, via)
  values (v_conv, v_me, v_body, 'app')
  returning id into v_msg;
  update public.conversations set last_message_at = now() where id = v_conv;
  update public.conversation_participants set last_read_at = now() where id = v_me;
  perform public.enqueue_message(v_msg, p_locale);
  return v_conv;
end;
$$;

-- The caller's existing conversation of this kind with a team member, or null.
create or replace function public.find_conversation(p_project_id uuid, p_person_id text, p_kind text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id
    from public.conversations c
    join public.conversation_participants cp on cp.conversation_id = c.id
   where c.project_id = p_project_id and c.person_id = p_person_id and c.kind = p_kind
     and cp.user_id = (select auth.uid())
   order by c.last_message_at desc
   limit 1;
$$;

-- Write in a conversation the caller takes part in.
create or replace function public.post_message(p_conversation_id uuid, p_body text, p_locale text default 'he')
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_body text := btrim(coalesce(p_body, ''));
  v_me   uuid;
  v_msg  uuid;
begin
  if v_user is null then
    raise exception 'sign in first' using errcode = '28000';
  end if;
  v_me := public.my_participant(p_conversation_id);
  if v_me is null then
    raise exception 'not your conversation' using errcode = '42501';
  end if;
  if char_length(v_body) not between 1 and 5000 then
    raise exception 'invalid message' using errcode = '22023';
  end if;
  if (select count(*) from public.messages m
        join public.conversation_participants cp on cp.id = m.participant_id
       where (cp.user_id = v_user or cp.id = v_me) and m.created_at > now() - interval '1 hour') >= 120 then
    raise exception 'too many messages' using errcode = 'HA104';
  end if;

  insert into public.messages (conversation_id, participant_id, body, via)
  values (p_conversation_id, v_me, v_body, 'app')
  returning id into v_msg;
  update public.conversations set last_message_at = now() where id = p_conversation_id;
  update public.conversation_participants set last_read_at = now() where id = v_me;
  perform public.enqueue_message(v_msg, p_locale);
  return v_msg;
end;
$$;

-- A conversation the caller takes part in, with its messages (all, or only those after `p_after`).
-- Reading marks it read. Null when the caller is not a participant.
create or replace function public.conversation_view(p_conversation_id uuid, p_after timestamptz default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me  uuid := public.my_participant(p_conversation_id);
  v_out jsonb;
begin
  if v_me is null then
    return null;
  end if;
  update public.conversation_participants set last_read_at = now() where id = v_me;

  select jsonb_build_object(
    'id', c.id,
    'kind', c.kind,
    'subject', c.subject,
    'project', case when p.id is not null and p.deleted_at is null
                    then jsonb_build_object('id', p.id, 'slug', p.slug, 'name', p.name) end,
    'me', v_me,
    'muted', (select cp.muted_at is not null from public.conversation_participants cp where cp.id = v_me),
    'participants', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', cp.id,
               'name', cp.display_name,
               'is_me', cp.id = v_me,
               'registered', cp.user_id is not null or public.user_by_email(cp.email) is not null
             ) order by cp.created_at), '[]'::jsonb)
      from public.conversation_participants cp where cp.conversation_id = c.id),
    'messages', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', m.id, 'from', m.participant_id, 'body', m.body, 'via', m.via, 'at', m.created_at
             ) order by m.created_at, m.id), '[]'::jsonb)
      from public.messages m
      where m.conversation_id = c.id and (p_after is null or m.created_at > p_after))
  )
  into v_out
  from public.conversations c
  left join public.projects p on p.id = c.project_id
  where c.id = p_conversation_id;
  return v_out;
end;
$$;

-- The caller's conversations, newest first.
create or replace function public.my_conversations()
returns table (
  id uuid, kind text, subject text, project_slug text, project_name jsonb,
  other_name text, last_body text, last_at timestamptz, last_from_me boolean, unread boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select distinct on (cp.conversation_id) cp.conversation_id, cp.id as me, cp.last_read_at
    from public.conversation_participants cp
    where cp.user_id = (select auth.uid()) or (cp.user_id is null and cp.email = public.my_email())
    order by cp.conversation_id, cp.user_id is null
  )
  select c.id, c.kind, c.subject,
         case when p.deleted_at is null then p.slug end,
         case when p.deleted_at is null then p.name end,
         (select string_agg(o.display_name, ', ' order by o.created_at)
            from public.conversation_participants o where o.conversation_id = c.id and o.id <> mine.me),
         last.body, coalesce(last.created_at, c.last_message_at),
         coalesce(last.participant_id = mine.me, false),
         last.created_at is not null and last.participant_id is distinct from mine.me
           and last.created_at > coalesce(mine.last_read_at, '-infinity'::timestamptz)
  from mine
  join public.conversations c on c.id = mine.conversation_id
  left join public.projects p on p.id = c.project_id
  left join lateral (
    select m.body, m.created_at, m.participant_id from public.messages m
    where m.conversation_id = c.id order by m.created_at desc, m.id desc limit 1
  ) last on true
  order by coalesce(last.created_at, c.last_message_at) desc;
$$;

-- Stop (or resume) getting emails from a conversation.
create or replace function public.set_conversation_muted(p_conversation_id uuid, p_muted boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.my_participant(p_conversation_id);
begin
  if v_me is null then
    raise exception 'not your conversation' using errcode = '42501';
  end if;
  update public.conversation_participants
     set muted_at = case when p_muted then coalesce(muted_at, now()) end
   where id = v_me;
end;
$$;

-- The "stop" link in an email (no account needed; the token is the proof):
--   a conversation's reply token → no more emails from that conversation
--   a contact's stop token       → no longer contactable through that initiative
create or replace function public.contact_stop(p_token uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.conversation_participants set muted_at = coalesce(muted_at, now()) where reply_token = p_token;
  if found then
    return 'conversation';
  end if;
  update public.project_contacts set opted_out_at = coalesce(opted_out_at, now()) where stop_token = p_token;
  if found then
    return 'contact';
  end if;
  return null;
end;
$$;

-- ------------------------------------------------------ mail worker: API ---

-- Take up to `p_limit` emails to send. Each is claimed for ten minutes; a failed one is retried (5 attempts),
-- and anything older than three days is given up. Only the mail worker (MAIL_WORKER_SECRET) gets anything.
create or replace function public.mail_claim(p_secret text, p_limit integer default 20)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_out jsonb;
begin
  if not public.mail_worker_ok(p_secret) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  update public.mail_outbox
     set failed_at = now(), last_error = coalesce(last_error, 'expired')
   where sent_at is null and failed_at is null and (created_at < now() - interval '3 days' or attempts >= 5);

  select array_agg(o.id) into v_ids from (
    select o.id from public.mail_outbox o
    where o.sent_at is null and o.failed_at is null
      and (o.claimed_at is null or o.claimed_at < now() - interval '10 minutes')
    order by o.created_at
    limit greatest(1, least(coalesce(p_limit, 20), 100))
    for update skip locked
  ) o;
  if v_ids is null then
    return '[]'::jsonb;
  end if;
  update public.mail_outbox set claimed_at = now(), attempts = attempts + 1 where id = any (v_ids);

  select coalesce(jsonb_agg(job order by created), '[]'::jsonb) into v_out from (
    select o.created_at as created, jsonb_build_object(
      'id', o.id,
      'kind', o.kind,
      'locale', o.locale,
      -- the recipient: an address only while they may still be written to
      'to_email', case
        when o.kind = 'notice' then (select c.email from public.project_contacts c
                                      where c.project_id = o.project_id and c.person_id = o.person_id
                                        and c.opted_out_at is null)
        else (select coalesce(rp.email, lower(u.email::text))
                from public.conversation_participants rp
                left join auth.users u on u.id = rp.user_id
               where rp.id = o.participant_id and rp.muted_at is null)
      end,
      'to_name', case
        when o.kind = 'notice' then public.team_person_name(p.team, o.person_id)
        else (select rp.display_name from public.conversation_participants rp where rp.id = o.participant_id)
      end,
      'to_registered', case
        when o.kind = 'notice' then public.user_by_email(
          (select c.email from public.project_contacts c where c.project_id = o.project_id and c.person_id = o.person_id)) is not null
        else (select rp.user_id is not null or public.user_by_email(rp.email) is not null
                from public.conversation_participants rp where rp.id = o.participant_id)
      end,
      'token', case
        when o.kind = 'notice' then (select c.stop_token from public.project_contacts c
                                      where c.project_id = o.project_id and c.person_id = o.person_id)
        else (select rp.reply_token from public.conversation_participants rp where rp.id = o.participant_id)
      end,
      'project', case when coalesce(p.id, cp_proj.id) is not null then jsonb_build_object(
        'slug', coalesce(p.slug, cp_proj.slug), 'name', coalesce(p.name, cp_proj.name)) end,
      'conversation', case when conv.id is not null then jsonb_build_object(
        'id', conv.id, 'kind', conv.kind, 'subject', conv.subject,
        'first', (select min(m2.created_at) = msg.created_at from public.messages m2 where m2.conversation_id = conv.id)) end,
      'message', case when msg.id is not null then jsonb_build_object(
        'body', msg.body,
        'from_name', (select sp.display_name from public.conversation_participants sp where sp.id = msg.participant_id)) end
    ) as job
    from public.mail_outbox o
    left join public.projects p on p.id = o.project_id
    left join public.conversations conv on conv.id = o.conversation_id
    left join public.projects cp_proj on cp_proj.id = conv.project_id and cp_proj.deleted_at is null
    left join public.messages msg on msg.id = o.message_id
    where o.id = any (v_ids)
  ) jobs;
  return v_out;
end;
$$;

-- Record the outcome of one email: sent (p_error null), or failed this time.
create or replace function public.mail_done(p_secret text, p_id uuid, p_error text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.mail_worker_ok(p_secret) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_error is null then
    update public.mail_outbox set sent_at = now(), last_error = null where id = p_id;
  else
    update public.mail_outbox
       set last_error = left(p_error, 500),
           claimed_at = null,
           failed_at = case when attempts >= 5 then now() end
     where id = p_id;
  end if;
end;
$$;

-- An email reply arrived at reply+<token>@…: add it to that participant's conversation.
-- Returns { conversation_id, status: 'added' | 'duplicate' } or null for an unknown token.
create or replace function public.mail_ingest(p_secret text, p_token uuid, p_body text, p_inbound_id text, p_locale text default 'he')
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  cp   public.conversation_participants;
  v_id uuid;
  v_body text := left(btrim(coalesce(p_body, '')), 10000);
begin
  if not public.mail_worker_ok(p_secret) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into cp from public.conversation_participants where reply_token = p_token;
  if cp.id is null then
    return null;
  end if;
  if v_body = '' then
    return jsonb_build_object('conversation_id', cp.conversation_id, 'status', 'empty');
  end if;

  insert into public.messages (conversation_id, participant_id, body, via, inbound_id)
  values (cp.conversation_id, cp.id, v_body, 'email', nullif(p_inbound_id, ''))
  on conflict (inbound_id) do nothing
  returning id into v_id;
  if v_id is null then
    return jsonb_build_object('conversation_id', cp.conversation_id, 'status', 'duplicate');
  end if;

  update public.conversations set last_message_at = now() where id = cp.conversation_id;
  update public.conversation_participants set last_read_at = now() where id = cp.id;
  perform public.enqueue_message(v_id, p_locale);
  return jsonb_build_object('conversation_id', cp.conversation_id, 'status', 'added');
end;
$$;

-- ----------------------------------------------------------- privileges ---

-- Supabase grants EXECUTE on new functions to anon/authenticated by default; be explicit instead.
revoke all on function public.team_person_ids(jsonb) from public, anon, authenticated;
revoke all on function public.team_person_name(jsonb, text) from public, anon, authenticated;
revoke all on function public.my_email() from public, anon, authenticated;
revoke all on function public.user_by_email(text) from public, anon, authenticated;
revoke all on function public.person_display_name(uuid) from public, anon, authenticated;
revoke all on function public.can_see_project(uuid) from public, anon, authenticated;
revoke all on function public.mail_worker_ok(text) from public, anon, authenticated;
revoke all on function public.project_people(uuid) from public, anon, authenticated;
revoke all on function public.project_contact_emails(uuid) from public, anon, authenticated;
revoke all on function public.apply_project_contacts(uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.set_project_contacts(uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.create_project(jsonb, jsonb, jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function public.my_participant(uuid) from public, anon, authenticated;
revoke all on function public.enqueue_message(uuid, text) from public, anon, authenticated;
revoke all on function public.start_conversation(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.find_conversation(uuid, text, text) from public, anon, authenticated;
revoke all on function public.post_message(uuid, text, text) from public, anon, authenticated;
revoke all on function public.conversation_view(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.my_conversations() from public, anon, authenticated;
revoke all on function public.set_conversation_muted(uuid, boolean) from public, anon, authenticated;
revoke all on function public.contact_stop(uuid) from public, anon, authenticated;
revoke all on function public.mail_claim(text, integer) from public, anon, authenticated;
revoke all on function public.mail_done(text, uuid, text) from public, anon, authenticated;
revoke all on function public.mail_ingest(text, uuid, text, text, text) from public, anon, authenticated;

grant execute on function public.project_people(uuid) to anon, authenticated;
grant execute on function public.project_contact_emails(uuid) to authenticated;
grant execute on function public.set_project_contacts(uuid, jsonb, text) to authenticated;
grant execute on function public.create_project(jsonb, jsonb, jsonb, jsonb, text) to authenticated;
grant execute on function public.start_conversation(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.find_conversation(uuid, text, text) to authenticated;
grant execute on function public.post_message(uuid, text, text) to authenticated;
grant execute on function public.conversation_view(uuid, timestamptz) to authenticated;
grant execute on function public.my_conversations() to authenticated;
grant execute on function public.set_conversation_muted(uuid, boolean) to authenticated;
-- No account needed; the token / the worker secret is the proof.
grant execute on function public.contact_stop(uuid) to anon, authenticated;
grant execute on function public.mail_claim(text, integer) to anon, authenticated;
grant execute on function public.mail_done(text, uuid, text) to anon, authenticated;
grant execute on function public.mail_ingest(text, uuid, text, text, text) to anon, authenticated;
