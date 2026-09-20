# Supabase setup — חממה

Hamama runs on **Railway** (the Next.js app) and stores everything in **Supabase** (PostgreSQL, Auth, Row Level Security).

```
Browser ──► Railway: Next.js (server components + server actions) ──► Supabase: Auth + Postgres (RLS)
                     │  reads the public catalogue with the anon key (role `anon`)
                     │  reads/writes as the person with THEIR session (role `authenticated`), so RLS decides
                     └─ the service-role key is never present
```

- **One source of truth.** Once Supabase is configured, `projects / needs / offers` are read from the database. The JSON files in `data/projects/` are seed data only.
- **No browser Supabase client.** Sign-in, sign-out and every write are server actions, so no key is bundled into client code and nothing depends on build-time `NEXT_PUBLIC_*` variables.
- **Authorization lives in the database.** Every write runs with the user's own JWT; RLS and column grants (see `supabase/migrations/20260920120100_rls.sql`) enforce who may do what. UI checks are convenience only.
- **New projects are created in Supabase directly** (section 3). No JSON file and no admin import is involved.

## 1. Create the project and the schema

1. Create a project at <https://supabase.com/dashboard>.
2. Apply the migrations **in order** — either:
   - **SQL editor:** paste and run `supabase/migrations/20260920120000_schema.sql`, then `20260920120100_rls.sql`, then `20260920130000_create_project.sql`; or
   - **CLI:** `npx supabase login`, `npx supabase link --project-ref <ref>`, `npx supabase db push`.

   Already running an earlier version? Only `20260920130000_create_project.sql` is new — run it (or `db push`) **before** deploying this version of the app, otherwise "publish" fails with "function not found".
3. Project Settings → API: copy the **Project URL** and the **anon / publishable key**.

Tables: `profiles`, `projects`, `project_stewards`, `needs`, `offers`, `wishes`, `opportunities`.

## 2. Import the demo / bootstrap projects (optional)

`db:seed` is **only** for the initial demo data and development fixtures. Projects that people create in the portal never depend on it (see section 3).

Create `.env.local` (git-ignored) on a trusted machine:

```
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role key>   # Project Settings → API. Never on Railway.
```

```bash
npm run check:data            # validates data/projects/*.json (offline)
npm run db:seed -- --dry-run  # shows what would happen
npm run db:seed               # imports what is missing
```

- **Idempotent.** Projects are matched by `slug`, needs/offers by `(project, key)`. Running it again creates nothing new.
- **Never overwrites by default.** After the import, stewards edit projects in Supabase, so re-running the seed skips existing projects. `npm run db:seed -- --update` deliberately re-applies the JSON to existing seed projects (it never deletes needs/offers and never touches wishes, stewards or opportunities).
- **Never touches portal-created projects**, not even with `--update`: a project with `created_by` set belongs to its stewards. (So a seed file added later whose slug equals a portal-created project is skipped, not merged.)
- Slugs, and therefore all `/projects/<slug>` URLs, are preserved.
- Connections are not stored: the transparent matching engine derives them from the Needs/Offers in the database, exactly as before. A row in `opportunities` is created when a person chooses to advance a connection.

## 3. Creating a project (the Add Project wizard)

```
Visitor fills the wizard ─► "פרסום המיזם" ─► server action createProject(draft)
   signed in? ─ no ─► draft saved in this browser (localStorage, 2 h) ─► /login?next=/projects/new?resume=1
                                                                            │  Google / magic link
                     ┌──────────────────────────────────────────────────────┘
                     ▼
   /projects/new?resume=1 ─► draft restored ─► createProject(draft)
   createProject ─► supabase.rpc("create_project") as the user  (ONE transaction)
        1. project row        published · public · not a demo · created_by = the user
        2. project_stewards   role = owner, status = approved   (the creator)
        3. needs, 4. offers   position order, status open / active
   ─► redirect to /projects/<slug>?created=1   "המיזם נוצר. עכשיו אפשר להמשיך לטפח אותו."
```

- **Anyone can fill the wizard**; only publishing needs an account. In demo mode (no Supabase) the last step still offers the JSON file, because there is nothing to save to.
- **Publication behaviour (deliberately simple).** The wizard's draft lives in the browser until the moment of publishing, so the database never holds half-finished projects. A project is born `review_status = 'published'`, `visibility = 'public'`: it is listed, searchable and part of matching at once. There is no moderation queue in this iteration. The columns still allow `draft` / `pending_review` and `unlisted` / `private`, but only an admin can set them (stewards cannot change them, in the wizard or by API):

  ```sql
  update public.projects set review_status = 'pending_review' where slug = 'some-project';  -- hide it from the public
  ```
- **Slugs.** The wizard proposes one (from the name; Hebrew-only names fall back to `my-project`, editable in the form). The database uses it if free, otherwise `name-2`, `name-3`, … — race-safe (`insert … on conflict (slug) do nothing`), so it can never overwrite another project, and `new` (the add-project route) is reserved. The slug never changes afterwards: editing cannot touch it (no column grant), so URLs stay stable. The confirmation redirect uses the slug the database actually assigned.
- **Atomicity.** `public.create_project(p_project jsonb, p_needs jsonb, p_offers jsonb)` is a single PL/pgSQL function, so a failure at any step (bad Need, bad Offer, constraint, …) rolls back the project, the stewardship and every Need/Offer. The app makes one call; there are no compensating deletes.
- **Ownership.** The owner is `auth.uid()` inside the function — it has no user-id parameter, and it ignores `created_by`, `visibility`, `review_status`, `is_demo` or `id` if a client sends them. Anonymous callers cannot execute it (`revoke … from public, anon`).
- **Claiming an existing project is unchanged:** *"אני מטפח/ת את המיזם הזה"* → `pending` → an admin approves (section 6). A user still cannot insert an `owner` or `approved` row themselves.
- **After creation:** the project is in *המרחב שלי* (role "בעלים"), the owner can edit it with the existing **עריכת המיזם** flow, and its Needs/Offers are in the matching results from the next request (nothing is cached or imported).

## 4. Sign-in

### Magic link (works immediately)
Enabled by default (Authentication → Providers → Email). Supabase's built-in mailer is rate-limited and meant for testing; configure a custom SMTP server (Authentication → Emails → SMTP Settings) before real use. No passwords are used.

### Google OAuth
1. **Google Cloud Console** → APIs & Services → **OAuth consent screen**: configure it (External, app name, support email).
2. **Credentials → Create credentials → OAuth client ID → Web application.**
   - *Authorized redirect URI:* `https://<project-ref>.supabase.co/auth/v1/callback` (exactly this; it is Supabase's URL, not the app's).
   - Copy the **Client ID** and **Client secret**.
3. **Supabase** → Authentication → Providers → **Google**: enable, paste Client ID and secret, save.
4. **Supabase** → Authentication → **URL Configuration**:
   - *Site URL:* your production URL (e.g. `https://hamama.up.railway.app`)
   - *Redirect URLs:* add `https://hamama.up.railway.app/auth/callback` and `http://localhost:3000/auth/callback`

The app cannot complete this for you: it needs your Google and Supabase accounts.

## 5. Railway

Add these **service variables** (Railway → your service → Variables), then redeploy:

| Variable | Value | Notes |
| --- | --- | --- |
| `SUPABASE_URL` | `https://<ref>.supabase.co` | read at runtime |
| `SUPABASE_ANON_KEY` | anon / publishable key | public by design; RLS protects the data |
| `SITE_URL` | `https://<your-app>.up.railway.app` | your public origin (or custom domain); used for sign-in return links |

**Do not** add `SUPABASE_SERVICE_ROLE_KEY` to Railway, and do not create any `NEXT_PUBLIC_SUPABASE_*` variables — the app does not use them.

Build and start commands are unchanged (`npm run build`, `npm start`). Every page is rendered on request, so the build does not need database access and pages are never served from a stale snapshot.

If the two Supabase variables are missing, the app does not crash: it serves the JSON files read-only in **demo mode** (no sign-in, nothing saved) and logs a warning. If they are set but Supabase is unreachable, pages show the error page instead of silently falling back.

## 6. Approving stewards

A signed-in person asks with **"אני מטפח/ת את המיזם הזה"**, which creates a `pending` row. Nobody can approve themselves — the app has no permission to update `project_stewards`. An admin approves:

```bash
npm run steward:approve                                          # list requests (with emails)
npm run steward:approve -- --project hamama --email you@example.com
npm run steward:approve -- --project hamama --user <uuid> --role owner
npm run steward:approve -- --project hamama --email you@example.com --revoke
```

…or in the Supabase SQL editor:

```sql
update public.project_stewards
   set status = 'approved'   -- and/or: role = 'owner'
 where project_id = (select id from public.projects where slug = 'hamama')
   and user_id    = (select id from auth.users where email = 'you@example.com');
```

Approved stewards get **עריכת המיזם** (the same wizard as "add a project", pre-filled): project details, activity status, Needs and Offers. They cannot change the slug, visibility, review status or demo flag.

## 7. Local development

```bash
npm install
cp .env.example .env.local   # fill SUPABASE_URL and SUPABASE_ANON_KEY
npm run dev                  # http://localhost:3000
```

Without `.env.local` the app runs in demo mode, exactly like before.

## 8. Tests

```bash
npm test          # everything below
npm run test:rls     # runs the real migrations in an in-process Postgres (PGlite) and checks every RLS rule as anon / authenticated users
npm run test:seed    # the seed import against real Postgres: fits the schema, idempotent, read-back is lossless
npm run test:mapper  # JSON → rows → project round trip for every seed file; wizard edit merge
npm run test:create  # creating a project from the wizard: ownership, RLS, slugs, atomicity, matching, draft handoff
```

`test:create` runs the real `create_project` function in the same in-process Postgres: anonymous callers are refused; the creator becomes approved owner; a second user cannot edit but can request stewardship (pending); a same-name project gets the next free slug and never overwrites; a failure in the last write leaves no project, steward, need or offer behind; the new Needs/Offers produce connections at once; and the draft survives the sign-in round trip (store → restore → create).

Not covered by automated tests: a live Supabase project, Google OAuth and the browser redirect (they need your credentials and a browser). Verify those with the steps below.

## 9. Acceptance checks (manual, against your Supabase)

1. **Wish.** Signed out: open `/wishes`, write a wish, *Find connections* → results appear. Press **שמירת המשאלה** → you are sent to sign in → after signing in the wish is saved and `/my-space` opens with it, its status and matching projects (Table editor → `wishes`: private, `open`, `interpretation` filled).
2. **Steward.** Signed in, open a project, press **אני מטפח/ת את המיזם הזה** → `project_stewards` has a `pending` row. Approve it (section 6). Open **עריכת המיזם**, change a Need, save → `needs` row updated, the public page shows it, and `/connections` reflects it.
3. **Connection.** Signed in, open `/connections`, press **אני רוצה לקדם את החיבור הזה** → `opportunities` row with `status = interested`, `requested_by` = you, shown under **החיבורים שלי** in `/my-space`. Nothing is sent to anybody.
4. **New project, signed out → Google.** In a private window open `/projects/new`, fill every step (one Need, one Offer), press **פרסום המיזם** → you are sent to sign in → after Google you land on `/projects/<slug>?created=1` with "המיזם נוצר…". Table editor: `projects` has the row (`published`, `public`, `created_by` = you), `project_stewards` has you as `owner` / `approved`, `needs` and `offers` have your rows. The project is in `/my-space` as "בעלים", **עריכת המיזם** works, and `/connections` lists connections that involve its Needs/Offers. No `db:seed` was run.
5. **Same name twice.** Create another project with the same name → it gets `<slug>-2`; the first project is unchanged.
6. **Someone else.** Sign in as a different account: the project page offers **אני מטפח/ת את המיזם הזה** (→ `pending`), `/projects/<slug>/edit` shows "העריכה פתוחה למטפחי המיזם".

## Deferred (on purpose)

Profile editing, public wishes UI, steward-side handling of incoming opportunities, multi-party opportunities, notifications, moderation tools, reputation, weighted voting, feeds, agents.

### Known limits of project creation

- **No rate limit and no moderation queue.** Any signed-in person can publish a project, and it is public immediately. If that becomes a problem, the first tools are a per-user cap inside `create_project()` and creating projects as `pending_review` (the read policies already hide those).
- **A retry after a lost response can create a second project** (`name-2`). There is no idempotency key; the button is disabled while a request is running.
- **Hebrew-only names get `my-project`, `my-project-2`, …** unless the person edits the English identifier in the form. There is no transliteration.
- **The draft is kept in the browser** (localStorage, two hours) only from the moment the person presses publish while signed out; it is not synced across devices, and it is lost if storage is blocked.
