import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

const MIGRATIONS = path.join(process.cwd(), "supabase", "migrations");

/** The pieces Supabase provides that the migrations rely on: roles, auth.users and auth.uid(). */
export const SUPABASE_STUBS = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb not null default '{}'::jsonb
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth, public to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  -- what a Supabase project grants by default; the migrations must not depend on it
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
`;

/**
 * Run `fn` with the Postgres role and JWT subject Supabase would use for this caller:
 * `authenticated` + auth.uid() = user, or the `anon` role for a signed-out visitor (user = null).
 */
export async function asUser<T>(db: PGlite, user: string | null, fn: () => Promise<T>): Promise<T> {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user ?? ""]);
  await db.exec(`set role ${user ? "authenticated" : "anon"}`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}

/** A fresh in-process Postgres with the Supabase stubs and every migration applied, in order. */
export async function createMigratedDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }
  return db;
}
