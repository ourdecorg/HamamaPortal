# חממה | פורטל מיזמי עתיד

**Future Initiatives Portal** — infrastructure for collective agency.

A portal where future-oriented initiatives say what they are trying to change, what they **need** and what they can **offer** — and where a small, transparent engine suggests **connections** between them, always with the reason why. The system suggests; people decide.

> All seed initiatives, people and links are **fictional demo content** (marked `is_demo` in the data and "דוגמה" in the UI).

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm run build && npm start
npm run check:data # validate /data/projects and print connections
```

Requires Node 20+. No database, no API key, no external service (fonts are fetched from Google Fonts at build time via `next/font`).

## What is where

```
app/
  page.tsx                 home: hero, pulse, seeking collaboration, connections, domains, wish well
  projects/page.tsx        explore: local search + domain / stage / need-offer filters
  projects/[slug]/page.tsx a project as a story
  projects/new/page.tsx    5-step wizard → JSON preview / download
  discover/page.tsx        conversational discovery (one sentence → matches + reasons)
  connections/page.tsx     every possible connection + needs nobody answers yet
  wishes/                  באר המשאלות (server action; nothing is stored)
  api/projects/route.ts    DEV-ONLY: write a wizard file into /data/projects
components/                ProjectCard, NeedBadge, OfferBadge, ConnectionCard, DomainTag,
                           EcosystemPulse, EcosystemMap, SearchBox, …
data/projects/*.json       one file per project  ← the only source of truth
lib/
  schema.ts                Zod schema for a project file
  projects.ts              data access layer (the ONLY module that touches the filesystem)
  matching.ts              connection engine
  discovery.ts             conversational discovery + LLM seam
  search.ts                keyword search with a relevance score
  taxonomy.ts, topics.ts   Hebrew vocabulary (domains, need/offer types, stages, topic lexicon)
types/project.ts           types derived from the Zod schema
```

### Data layer

Pages call `getProjects()`, `getProjectBySlug()`, `searchProjects()`, `getDomains()`, `getSuggestedConnections()`, `getConnections()`, `getEcosystemStats()` … from `lib/projects.ts` and never see the filesystem. To move to a database later, re-implement `readAllFromDisk()` in that file (or the exported functions) and keep the signatures.

A malformed file (bad JSON, failed validation, duplicate slug) is **skipped and reported**, never fatal: the rest of the site keeps working, `npm run check:data` lists what was skipped, and in development a notice appears on the home page.

### Adding a project

1. Use **/projects/new**, then **Download JSON** — or copy any file in `data/projects/`.
2. Put the file in `data/projects/` (file name = slug).
3. Restart / rebuild. The file being there is the approval; set `portal.review_status` to `pending_review` (or `visibility` to `private`) to hide it.

In `npm run dev` only, the wizard also has a **save to project folder** button. The route (`app/api/projects/route.ts`) returns 404 outside development, accepts localhost only, refuses cross-origin requests, validates with the same Zod schema, derives the file name from the validated slug, and never overwrites an existing file.

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

## Principles carried in the UI

- **Structured before smart** — JSON first, AI later.
- **Explainable matching** — every suggestion says why, and what is still unknown.
- **Signals, not a single score** — no ratings, no bare percentages.
- **Action over engagement** — connections end in a next step and an editable intro draft.
- **Progressive disclosure** — optional fields stay collapsed.
- **Human in the loop** — the system suggests; people decide.

## Not built (on purpose)

Auth, database, accounts, messaging, feeds, tokens, reputation, voting, embeddings, agents, moderation, notifications.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · shadcn/ui-style primitives (`components/ui`) · lucide-react · Zod.
