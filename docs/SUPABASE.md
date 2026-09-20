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

## 1. Create the project and the schema

1. Create a project at <https://supabase.com/dashboard>.
2. Apply the migrations **in order** — either:
   - **SQL editor:** paste and run `supabase/migrations/20260920120000_schema.sql`, then `20260920120100_rls.sql`; or
   - **CLI:** `npx supabase login`, `npx supabase link --project-ref <ref>`, `npx supabase db push`.
3. Project Settings → API: copy the **Project URL** and the **anon / publishable key**.

Tables: `profiles`, `projects`, `project_stewards`, `needs`, `offers`, `wishes`, `opportunities`.

## 2. Import the existing projects

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
- **Never overwrites by default.** After the import, stewards edit projects in Supabase, so re-running the seed skips existing projects. `npm run db:seed -- --update` deliberately re-applies the JSON to existing projects (it never deletes needs/offers and never touches wishes, stewards or opportunities).
- Slugs, and therefore all `/projects/<slug>` URLs, are preserved.
- Connections are not stored: the transparent matching engine derives them from the imported Needs/Offers, exactly as before. A row in `opportunities` is created when a person chooses to advance a connection.

## 3. Sign-in

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

## 4. Railway

Add these **service variables** (Railway → your service → Variables), then redeploy:

| Variable | Value | Notes |
| --- | --- | --- |
| `SUPABASE_URL` | `https://<ref>.supabase.co` | read at runtime |
| `SUPABASE_ANON_KEY` | anon / publishable key | public by design; RLS protects the data |
| `SITE_URL` | `https://<your-app>.up.railway.app` | your public origin (or custom domain); used for sign-in return links |

**Do not** add `SUPABASE_SERVICE_ROLE_KEY` to Railway, and do not create any `NEXT_PUBLIC_SUPABASE_*` variables — the app does not use them.

Build and start commands are unchanged (`npm run build`, `npm start`). Every page is rendered on request, so the build does not need database access and pages are never served from a stale snapshot.

If the two Supabase variables are missing, the app does not crash: it serves the JSON files read-only in **demo mode** (no sign-in, nothing saved) and logs a warning. If they are set but Supabase is unreachable, pages show the error page instead of silently falling back.

## 5. Approving stewards

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

## 6. Local development

```bash
npm install
cp .env.example .env.local   # fill SUPABASE_URL and SUPABASE_ANON_KEY
npm run dev                  # http://localhost:3000
```

Without `.env.local` the app runs in demo mode, exactly like before.

## 7. Tests

```bash
npm test          # everything below
npm run test:rls     # runs the real migrations in an in-process Postgres (PGlite) and checks every RLS rule as anon / authenticated users
npm run test:seed    # the seed import against real Postgres: fits the schema, idempotent, read-back is lossless
npm run test:mapper  # JSON → rows → project round trip for every seed file; wizard edit merge
```

Not covered by automated tests: a live Supabase project and Google OAuth (they need your credentials). Verify those with the steps below.

## 8. Acceptance checks (manual, against your Supabase)

1. **Wish.** Signed out: open `/wishes`, write a wish, *Find connections* → results appear. Press **שמירת המשאלה** → you are sent to sign in → after signing in the wish is saved and `/my-space` opens with it, its status and matching projects (Table editor → `wishes`: private, `open`, `interpretation` filled).
2. **Steward.** Signed in, open a project, press **אני מטפח/ת את המיזם הזה** → `project_stewards` has a `pending` row. Approve it (section 5). Open **עריכת המיזם**, change a Need, save → `needs` row updated, the public page shows it, and `/connections` reflects it.
3. **Connection.** Signed in, open `/connections`, press **אני רוצה לקדם את החיבור הזה** → `opportunities` row with `status = interested`, `requested_by` = you, shown under **החיבורים שלי** in `/my-space`. Nothing is sent to anybody.

## Deferred (on purpose)

Publishing brand-new projects from the wizard straight into Supabase (today: JSON + `db:seed`), profile editing, public wishes UI, steward-side handling of incoming opportunities, multi-party opportunities, notifications, moderation tools, reputation, weighted voting, feeds, agents.
