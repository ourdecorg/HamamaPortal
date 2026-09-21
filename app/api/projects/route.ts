import { promises as fs } from "node:fs";
import path from "node:path";
import { projectFileSchema } from "@/lib/schema";

/**
 * DEVELOPMENT ONLY — writes a wizard-produced project file into /data/projects.
 *
 * Kept deliberately small and locked down:
 *  - does nothing outside `next dev` (404 in production builds)
 *  - only accepts requests addressed to localhost, from the same origin
 *  - validates the body with the same Zod schema the site uses
 *  - the file name comes from the validated slug (letters, digits, dashes)
 *  - never overwrites an existing file
 */

const DATA_DIR = path.join(process.cwd(), "data", "projects");
const MAX_BYTES = 200_000;
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

const json = (body: unknown, status = 200) => Response.json(body, { status });

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") return json({ error: "Not found" }, 404);

  const host = request.headers.get("host") ?? "";
  if (!LOCAL_HOST.test(host)) return json({ error: "Local requests only." }, 403);

  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== host) return json({ error: "Cross-origin request refused." }, 403);

  const raw = await request.text();
  if (raw.length > MAX_BYTES) return json({ error: "File too large." }, 413);

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "Invalid JSON." }, 400);
  }

  const parsed = projectFileSchema.safeParse(body);
  if (!parsed.success) {
    const detail = parsed.error.issues[0];
    return json({ error: `Invalid project: ${detail?.path.join(".")} — ${detail?.message}` }, 400);
  }

  const { slug } = parsed.data.project;
  const target = path.resolve(DATA_DIR, `${slug}.json`);
  if (path.dirname(target) !== path.resolve(DATA_DIR)) return json({ error: "Invalid file name." }, 400);

  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(target, JSON.stringify(parsed.data, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") {
      // The wizard turns the code into a message in the visitor's language.
      return json({ error: `The identifier "${slug}" already exists. Choose another one.`, code: "slug_exists", slug }, 409);
    }
    return json({ error: "Could not write the file." }, 500);
  }

  return json({ ok: true, file: `data/projects/${slug}.json` }, 201);
}
