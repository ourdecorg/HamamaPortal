# החממה | פורטל מיזמי עתיד

**Future Initiatives Portal** — infrastructure for collective agency.

A portal where future-oriented initiatives say what they are trying to change, what they **need** and what they can **offer** — and where a small, transparent engine suggests **connections** between them, always with the reason why. The system suggests; people decide.

> All seed initiatives, people and links are **fictional demo content** (marked `is_demo` in the data and "דוגמה" in the UI).

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm run build && npm start
npm run check:data # validate the seed files in /data/projects (offline)
npm test           # RLS policies, seed import and data mapping (in-process Postgres)
```

Requires Node 20+. With no environment variables the app runs in read-only **demo mode** on the JSON files. To persist wishes, stewardship and connections, connect it to Supabase — see [docs/SUPABASE.md](docs/SUPABASE.md). (Fonts are fetched from Google Fonts at build time via `next/font`.)

## What is where

```
app/
  page.tsx                 home: hero, pulse, seeking collaboration, connections, domains, wish well
  projects/page.tsx        explore: local search + domain / stage / need-offer filters
  projects/[slug]/page.tsx a project as a story
  projects/new/page.tsx    the wizard: publishes straight to Supabase (JSON preview only in demo mode)
  discover/page.tsx        conversational discovery (one sentence → matches + reasons)
  connections/page.tsx     every possible connection + needs nobody answers yet
  wishes/                  באר המשאלות (analyse for everyone; "save this wish" needs sign-in)
  login/, auth/            Supabase Auth: Google + magic link, server actions, /auth/callback
  my-space/                המרחב שלי: my wishes, my projects, my connections
  projects/[slug]/edit/    steward-only: the wizard, pre-filled
  api/projects/route.ts    DEV-ONLY, demo mode: write a wizard JSON file into /data/projects
components/                ProjectCard, NeedBadge, OfferBadge, ConnectionCard, DomainTag,
                           EcosystemPulse, EcosystemMap, SearchBox, …
proxy.ts                   keeps the Supabase session fresh (not an authorization layer)
supabase/migrations/       schema, Row Level Security, create_project() (the reproducible source of the database)
data/projects/*.json       SEED / demo data: imported by `npm run db:seed`, read at runtime only in demo mode
scripts/                   seed.ts, approve-steward.ts (service-role CLI), check-data.ts
tests/                     RLS, seed and mapping tests
lib/
  schema.ts                Zod schema for a project (the model the UI and matching read)
  projects.ts              data access layer: Supabase at runtime (JSON only in demo mode)
  project-mapper.ts        project ⇄ database rows (shared by the seed, the app and the tests)
  supabase/, auth.ts       Supabase clients and the current user (verified server-side)
  matching.ts              connection engine
  discovery.ts             conversational discovery + LLM seam
  search.ts                keyword search with a relevance score
  taxonomy.ts, topics.ts   Hebrew vocabulary (domains, need/offer types, stages, topic lexicon)
types/project.ts           types derived from the Zod schema
```

### Data layer

Pages call `getProjects()`, `getProjectBySlug()`, `searchProjects()`, `getDomains()`, `getSuggestedConnections()`, `getConnections()`, `getEcosystemStats()` … from `lib/projects.ts` and never see the backend. At runtime that is **Supabase** (`projects`, `needs`, `offers`); the connection engine and discovery still run over the same `Project` objects as before, so a steward's edit changes the matching immediately. Persistent objects — `projects` (created by the wizard through `create_project()`), `wishes`, `project_stewards`, `opportunities` — are written by server actions with the user's own session, and Row Level Security decides what is allowed.

A malformed record (failed validation) is **skipped and reported**, never fatal.

### Adding a project

1. Use **/projects/new**, then **Download JSON** — or copy any file in `data/projects/`.
2. Put the file in `data/projects/` (file name = slug) and run `npm run db:seed`. It only adds what is missing and never overwrites what stewards edited. Set `portal.review_status` to `pending_review` (or `visibility` to `private`) to keep it hidden.
3. Someone who looks after the project asks with **אני מטפח/ת את המיזם הזה**; an admin approves (`npm run steward:approve`); from then on they edit it on the site.

In `npm run dev` only, the wizard also has a **save to project folder** button (it writes the JSON file; run the seed afterwards). The route (`app/api/projects/route.ts`) returns 404 outside development, accepts localhost only, refuses cross-origin requests, validates with the same Zod schema, derives the file name from the validated slug, and never overwrites an existing file.

### Admin area (`/admin`)

Active admins manage every initiative (search, filter, edit both languages with automatic translation, publication state, soft delete / restore) and the list of admins. Admin status lives in the database (`public.admin_users`) and every privileged operation is enforced there; the system never ends up with zero admins. The first admin is created from a trusted machine with `npm run admin -- --grant --email you@example.com` — see [docs/SUPABASE.md §7](docs/SUPABASE.md#7-administrators-and-the-admin-area).

### The connection engine (`lib/matching.ts`)

Deterministic and readable. For every open **need** of project A and every **offer** of project B:

| Signal | Weight |
| --- | --- |
| need type = offer type / a related type (`taxonomy.ts`) | 0.32 / 0.20 |
| shared keyword tags (up to 3; generic tags like "community" ignored) | 0.14 each |
| shared domains | 0.08 – 0.12 |
| compatible collaboration preferences | 0.03 each (max 2) |

A pair needs a real *topical* link (shared keywords) on top of category — a domain match alone is never a connection. The output (`Connection`) carries `reasons`, `unknowns` (what the data cannot tell: geography, availability, scope…), suggested next steps and a `confidence` that is **only a UI hint** — it is shown as "אות חזק / סביר / ראשוני", never as a percentage. To replace the engine (embeddings, an LLM, human curation), keep the `Connection` shape and swap `findConnections`.

Tip: add English `keywords` to needs and offers in the JSON. They make matching precise and work across Hebrew/English.

### Discovery (`lib/discovery.ts`)

`discover({ query, projects, context })` → `{ interpretation, matches, reasons, suggested_actions }`. Today it is a heuristic (topic lexicon + keyword scoring). Nothing needs an API key. `DiscoveryProvider` / `LlmClient` / `createLlmProvider()` define the seam for a model; to enable one, return it from `getDiscoveryProvider()` (e.g. when `ANTHROPIC_API_KEY` is set). A provider can only rank and explain projects that exist in the data, and any failure falls back to the heuristic.

## Languages (Hebrew and English)

Every page lives under a language prefix: `/he/...` and `/en/...`. A URL with no prefix is redirected by `proxy.ts` to the visitor's language (their last choice, then the browser's `Accept-Language`, then Hebrew). The header has a switch link, and `<html lang dir>` follows the language, so English is laid out left-to-right and Hebrew right-to-left.

- **UI text** is in `lib/i18n/messages/he.ts` and `en.ts`. `he.ts` defines the shape; `en.ts` is typed against it, so a missing key fails `npm run typecheck`. Server components use `getMessages()` / `getLocale()` (`lib/i18n/server.ts`), client components use `useMessages()` / `useLocale()` (`components/LocaleProvider.tsx`), and server actions receive the language from the caller (`lib/i18n/action-locale.ts`).
- **Links**: import `Link` from `@/components/LocaleLink` (not `next/link`) so links keep the language. `NextArrow` / `PrevArrow` (`components/Arrows.tsx`) point the right way in both directions. Use logical Tailwind classes (`ms-`, `ps-`, `start-`), never `ml-` / `left-`.
- **Project content** is bilingual data (`{ default, translations: { he, en } }`); a text missing in the visitor's language falls back to the other one. What someone types in the wizard is stored under the language of the page they typed it on. The wizard's *translation* step shows and edits the other language too, and can translate automatically in either direction with OpenAI (server-side, `OPENAI_API_KEY`; optional `OPENAI_TRANSLATION_MODEL`). A new initiative is translated on arrival at that step; an existing translation is only replaced after the person confirms and reviews the new one. Unedited automatic translations carry `machine: { <lang>: { from, at } }` inside the text's JSON, and lose it when edited by hand. Without a key, people write the translation themselves.
- **Engines**: `findConnections`, `discover` and the wizard helpers take a `locale`, so explanations are written in the visitor's language.
- **Add a language**: add it to `LOCALES` / `LOCALE_META` in `lib/i18n/config.ts`, write `messages/<code>.ts`, register it in `messages/index.ts`, and extend the `{ he, en }` label pairs in `lib/taxonomy.ts` and `lib/topics.ts`.
- `/auth/callback` and `/api/*` stay un-prefixed (Supabase and Google have the callback URL on their allow-lists), so no auth configuration changes.

## Principles carried in the UI

- **Structured before smart** — JSON first, AI later.
- **Explainable matching** — every suggestion says why, and what is still unknown.
- **Signals, not a single score** — no ratings, no bare percentages.
- **Action over engagement** — connections end in a next step and an editable intro draft.
- **Progressive disclosure** — optional fields stay collapsed.
- **Human in the loop** — the system suggests; people decide.

## Not built (on purpose)

Messaging, feeds, tokens, reputation, voting, embeddings, agents, moderation tools, notifications. (Accounts, a database and persistence exist now, but stay deliberately small — see the deferred list in [docs/SUPABASE.md](docs/SUPABASE.md).)

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · shadcn/ui-style primitives (`components/ui`) · lucide-react · Zod · Supabase (Postgres, Auth, RLS) via `@supabase/ssr`. Hosted on Railway.
