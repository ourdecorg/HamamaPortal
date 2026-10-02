/**
 * People contacting each other — against real Postgres (PGlite) with the real migrations, as Supabase runs them
 * (role + JWT subject, RLS, grants). What matters most here: no email address is ever readable by visitors or by
 * the people who write to someone, and only a conversation's participants see it.
 *
 *   npm run test:contacts
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { asUser, createMigratedDb } from "./helpers/pg";

const ALICE = "00000000-0000-4000-8000-00000000000a"; // creates the initiative
const BOB = "00000000-0000-4000-8000-00000000000b"; // registered team member
const CAROL = "00000000-0000-4000-8000-00000000000c"; // a visitor who writes to people
const DAN = "00000000-0000-4000-8000-00000000000d"; // someone else
const SECRET = "s".repeat(40);

const text = (he: string) => ({ translations: { he } });
const TEAM = [
  { id: "p-alice", name: "Alice" },
  { id: "p-bob", name: "Bob", role: text("מנחה") },
  { id: "p-erin", name: "Erin" }, // not registered: email only
  { id: "p-old", name: "Old member" }, // no email: cannot be contacted
];
const CONTACTS = [
  { person_id: "p-alice", email: "alice@example.com" },
  { person_id: "p-bob", email: "Bob@Example.com " }, // stored normalised
  { person_id: "p-erin", email: "erin@elsewhere.org" },
];

let db: PGlite;
let project: string;

const rows = async (sql: string, params: unknown[] = []) => (await db.query<Record<string, unknown>>(sql, params)).rows;
const one = async (sql: string, params: unknown[] = []) => (await rows(sql, params))[0];
const as = <T>(user: string | null, fn: () => Promise<T>) => asUser(db, user, fn);
const call = (user: string | null, sql: string, params: unknown[] = []) => as(user, () => one(sql, params));

function start(user: string, person: string, kind: "email" | "chat", body = "שלום", subject = "שאלה") {
  return call(user, "select public.start_conversation($1, $2, $3, $4, $5, 'he') as id", [project, person, kind, subject, body]).then(
    (r) => r.id as string,
  );
}

/** The error code a call fails with (or "ok"). */
async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "ok";
  } catch (err) {
    return (err as { code?: string }).code ?? "error";
  }
}

const outbox = () => rows("select kind, person_id, participant_id, message_id from public.mail_outbox where sent_at is null order by created_at, id");

before(async () => {
  db = await createMigratedDb();
  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${ALICE}', 'alice@example.com', '{"full_name": "Alice A"}'),
      ('${BOB}',   'bob@example.com',   '{"full_name": "Bob B"}'),
      ('${CAROL}', 'carol@example.com', '{"full_name": "Carol C"}'),
      ('${DAN}',   'dan@example.com',   '{}');
    insert into private.app_secrets (name, hash) values ('mail_worker', encode(sha256(convert_to('${SECRET}', 'UTF8')), 'hex'));
  `);
  const created = await call(ALICE, "select public.create_project($1::jsonb, '[]', '[]', $2::jsonb, 'he') as r", [
    JSON.stringify({
      slug: "team-project",
      name: text("צוות"),
      tagline: text("t"),
      short_description: text("s"),
      vision: text("v"),
      problem: text("p"),
      desired_change: text("d"),
      domains: ["community"],
      lifecycle_stage: "idea",
      team: TEAM,
    }),
    JSON.stringify(CONTACTS),
  ]);
  project = (created.r as { id: string }).id;
});

after(async () => {
  await db.close();
});

describe("team emails", () => {
  it("are stored with the project, normalised, and each new address is queued a notice — not the creator's own", async () => {
    const stored = await rows("select person_id, email from public.project_contacts order by person_id");
    assert.deepEqual(stored, [
      { person_id: "p-alice", email: "alice@example.com" },
      { person_id: "p-bob", email: "bob@example.com" },
      { person_id: "p-erin", email: "erin@elsewhere.org" },
    ]);
    assert.deepEqual((await outbox()).map((o) => [o.kind, o.person_id]).sort(), [
      ["notice", "p-bob"],
      ["notice", "p-erin"],
    ]);
  });

  it("are never readable directly — not by visitors, members, or even the project's owner", async () => {
    for (const user of [null, CAROL, ALICE]) {
      assert.notEqual(await code(as(user, () => rows("select * from public.project_contacts"))), "ok");
      assert.notEqual(await code(as(user, () => rows("select * from public.conversation_participants"))), "ok");
      assert.notEqual(await code(as(user, () => rows("select * from public.mail_outbox"))), "ok");
    }
  });

  it("show visitors only who is registered and contactable — no address", async () => {
    const people = await as(null, () => rows("select * from public.project_people($1) order by person_id", [project]));
    assert.deepEqual(people, [
      { person_id: "p-alice", registered: true, contactable: true, is_me: false },
      { person_id: "p-bob", registered: true, contactable: true, is_me: false },
      { person_id: "p-erin", registered: false, contactable: true, is_me: false },
    ]);
    assert.ok(!JSON.stringify(people).includes("@"));
    const mine = await as(BOB, () => rows("select person_id from public.project_people($1) where is_me", [project]));
    assert.deepEqual(mine, [{ person_id: "p-bob" }]);
  });

  it("can be read (for the edit form) and replaced only by the project's stewards", async () => {
    assert.equal((await as(CAROL, () => rows("select * from public.project_contact_emails($1)", [project]))).length, 0);
    assert.equal((await as(ALICE, () => rows("select * from public.project_contact_emails($1)", [project]))).length, 3);
    assert.equal(
      await code(call(CAROL, "select public.set_project_contacts($1, $2::jsonb, 'he')", [project, JSON.stringify([])])),
      "42501",
    );
    assert.equal(await code(call(null, "select public.set_project_contacts($1, '[]'::jsonb, 'he')", [project])), "42501");
  });

  it("refuse an address for someone who is not on the team, or a malformed one", async () => {
    const bad = (contacts: object[]) =>
      code(call(ALICE, "select public.set_project_contacts($1, $2::jsonb, 'he')", [project, JSON.stringify(contacts)]));
    assert.equal(await bad([...CONTACTS, { person_id: "p-ghost", email: "g@example.com" }]), "22023");
    assert.equal(await bad([{ person_id: "p-bob", email: "not an email" }]), "22023");
  });
});

describe("conversations", () => {
  let emailToErin: string;

  it("an email to an unregistered team member: a conversation, its first message, and the email queued", async () => {
    await db.exec("delete from public.mail_outbox");
    emailToErin = await start(CAROL, "p-erin", "email", "רציתי לשאול", "שאלה על המיזם");
    const view = (await call(CAROL, "select public.conversation_view($1) as v", [emailToErin])).v as {
      kind: string;
      subject: string;
      participants: { name: string; is_me: boolean; registered: boolean }[];
      messages: { body: string }[];
    };
    assert.equal(view.kind, "email");
    assert.equal(view.subject, "שאלה על המיזם");
    assert.deepEqual(
      view.participants.map((p) => [p.name, p.is_me, p.registered]),
      [
        ["Carol C", true, true],
        ["Erin", false, false],
      ],
    );
    assert.deepEqual(view.messages.map((msg) => msg.body), ["רציתי לשאול"]);
    assert.ok(!JSON.stringify(view).includes("erin@"), "the writer never sees the address");
    assert.deepEqual((await outbox()).map((o) => o.kind), ["message"]);
  });

  it("continues the same conversation when the same person writes to the same member again", async () => {
    assert.equal(await start(CAROL, "p-erin", "email", "ועוד משהו"), emailToErin);
    const n = await one("select count(*)::int as n from public.messages where conversation_id = $1", [emailToErin]);
    assert.equal(n.n, 2);
  });

  it("is invisible to anyone who does not take part in it", async () => {
    assert.equal((await call(DAN, "select public.conversation_view($1) as v", [emailToErin])).v, null);
    assert.equal(await code(call(DAN, "select public.post_message($1, 'x', 'he')", [emailToErin])), "42501");
    assert.equal((await as(DAN, () => rows("select * from public.my_conversations()"))).length, 0);
  });

  it("refuses chat with someone who is not registered, writing to yourself, and visitors", async () => {
    assert.equal(await code(start(CAROL, "p-erin", "chat")), "HA103");
    assert.equal(await code(start(BOB, "p-bob", "chat")), "HA102");
    assert.equal(await code(start(CAROL, "p-old", "email")), "P0002");
    assert.equal(
      await code(call(null, "select public.start_conversation($1, 'p-bob', 'chat', '', 'x', 'he')", [project])),
      "42501", // no EXECUTE for anon
    );
  });

  it("chat: one email note per unread stretch, and the unread mark in the list", async () => {
    await db.exec("delete from public.mail_outbox");
    const chat = await start(CAROL, "p-bob", "chat", "היי");
    await call(CAROL, "select public.post_message($1, 'עוד הודעה', 'he')", [chat]);
    assert.deepEqual((await outbox()).map((o) => o.kind), ["notify"], "one note, not one per message");

    const list = await as(BOB, () => rows("select id, kind, other_name, last_body, unread from public.my_conversations()"));
    assert.deepEqual(list, [{ id: chat, kind: "chat", other_name: "Carol C", last_body: "עוד הודעה", unread: true }]);

    await call(BOB, "select public.conversation_view($1) as v", [chat]); // Bob reads it
    const read = await as(BOB, () => rows("select unread from public.my_conversations()"));
    assert.deepEqual(read, [{ unread: false }]);

    await call(BOB, "select public.post_message($1, 'תשובה', 'he')", [chat]);
    await call(CAROL, "select public.post_message($1, 'ושוב', 'he')", [chat]);
    const kinds = (await outbox()).map((o) => o.kind);
    assert.deepEqual(kinds, ["notify", "notify", "notify"], "a new note once Bob had read the conversation");
  });

  it("stops the notes for someone who muted the conversation", async () => {
    const chat = (await call(CAROL, "select public.find_conversation($1, 'p-bob', 'chat') as id", [project])).id as string;
    await call(BOB, "select public.set_conversation_muted($1, true)", [chat]);
    await call(BOB, "select public.conversation_view($1)", [chat]);
    await db.exec("delete from public.mail_outbox");
    await call(CAROL, "select public.post_message($1, 'שקט?', 'he')", [chat]);
    assert.deepEqual(await outbox(), []);
    await call(BOB, "select public.set_conversation_muted($1, false)", [chat]);
  });
});

describe("the mail worker", () => {
  it("gets the queue — with addresses — only with the secret", async () => {
    await db.exec("delete from public.mail_outbox");
    await start(CAROL, "p-erin", "email", "הודעה שלישית");
    assert.equal(await code(call(null, "select public.mail_claim('wrong-secret-wrong-secret-wrong-secret', 10)")), "42501");
    assert.equal(await code(call(CAROL, "select public.mail_claim($1, 10)", ["x".repeat(40)])), "42501");

    const jobs = (await call(null, "select public.mail_claim($1, 10) as j", [SECRET])).j as {
      id: string;
      kind: string;
      to_email: string;
      to_registered: boolean;
      token: string;
      message: { body: string; from_name: string };
      conversation: { first: boolean };
    }[];
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].kind, "message");
    assert.equal(jobs[0].to_email, "erin@elsewhere.org");
    assert.equal(jobs[0].to_registered, false);
    assert.equal(jobs[0].message.from_name, "Carol C");
    assert.equal(jobs[0].conversation.first, false);
    assert.match(jobs[0].token, /^[0-9a-f-]{36}$/);

    // Claimed: not handed out twice while it is being sent.
    assert.deepEqual((await call(null, "select public.mail_claim($1, 10) as j", [SECRET])).j, []);
    await call(null, "select public.mail_done($1, $2, null)", [SECRET, jobs[0].id]);
    assert.ok((await one("select sent_at from public.mail_outbox where id = $1", [jobs[0].id])).sent_at);
  });

  it("adds an email reply to the conversation of the token's participant — once", async () => {
    const erin = await one(
      "select cp.reply_token, cp.conversation_id from public.conversation_participants cp where cp.email = 'erin@elsewhere.org'",
    );
    await db.exec("delete from public.mail_outbox");
    const ingest = (id: string) =>
      call(null, "select public.mail_ingest($1, $2, 'תודה, אשמח לדבר', $3, 'he') as r", [SECRET, erin.reply_token, id]).then((r) => r.r);

    assert.deepEqual(await ingest("inbound-1"), { conversation_id: erin.conversation_id, status: "added" });
    assert.deepEqual(await ingest("inbound-1"), { conversation_id: erin.conversation_id, status: "duplicate" });
    assert.equal(
      (await call(null, "select public.mail_ingest($1, gen_random_uuid(), 'x', 'inbound-2', 'he') as r", [SECRET])).r,
      null,
      "unknown token",
    );
    assert.equal(
      await code(call(null, "select public.mail_ingest('nope-nope-nope-nope-nope-nope-nope', $1, 'x', 'i3', 'he')", [erin.reply_token])),
      "42501",
    );

    const view = (await call(CAROL, "select public.conversation_view($1) as v", [erin.conversation_id])).v as {
      messages: { body: string; via: string }[];
    };
    assert.deepEqual(view.messages.at(-1), { ...view.messages.at(-1), body: "תודה, אשמח לדבר", via: "email" });
    assert.deepEqual((await outbox()).map((o) => o.kind), ["message"], "the reply goes on to Carol's inbox");
  });

  it("lets an address participant who signs up later find the conversation in their space", async () => {
    const ERIN = "00000000-0000-4000-8000-0000000000e1";
    await db.exec(`insert into auth.users (id, email) values ('${ERIN}', 'erin@elsewhere.org')`);
    const list = await as(ERIN, () => rows("select other_name from public.my_conversations()"));
    assert.deepEqual(list, [{ other_name: "Carol C" }]);
    const people = await as(null, () => rows("select registered from public.project_people($1) where person_id = 'p-erin'", [project]));
    assert.deepEqual(people, [{ registered: true }], "now shown as registered");
  });
});

describe("stop links", () => {
  it("a conversation's link mutes it; a notice's link makes the person uncontactable", async () => {
    const token = (await one("select reply_token from public.conversation_participants where display_name = 'Erin'")).reply_token;
    assert.equal((await call(null, "select public.contact_stop($1) as r", [token])).r, "conversation");

    const stop = (await one("select stop_token from public.project_contacts where person_id = 'p-bob'")).stop_token;
    assert.equal((await call(null, "select public.contact_stop($1) as r", [stop])).r, "contact");
    const bob = await as(null, () => rows("select contactable from public.project_people($1) where person_id = 'p-bob'", [project]));
    assert.deepEqual(bob, [{ contactable: false }]);
    assert.equal(await code(start(DAN, "p-bob", "chat")), "HA101");

    assert.equal((await call(null, "select public.contact_stop(gen_random_uuid()) as r")).r, null);
  });

  it("a new address for that person makes them contactable again, with a new notice", async () => {
    await db.exec("delete from public.mail_outbox");
    const next = CONTACTS.map((c) => (c.person_id === "p-bob" ? { ...c, email: "bob.new@example.com" } : c));
    await call(ALICE, "select public.set_project_contacts($1, $2::jsonb, 'en')", [project, JSON.stringify(next)]);
    const bob = await as(null, () => rows("select contactable, registered from public.project_people($1) where person_id = 'p-bob'", [project]));
    assert.deepEqual(bob, [{ contactable: true, registered: false }]);
    assert.deepEqual(await rows("select kind, person_id, locale from public.mail_outbox"), [{ kind: "notice", person_id: "p-bob", locale: "en" }]);
  });

  it("removing a person from the contacts removes their address", async () => {
    await call(ALICE, "select public.set_project_contacts($1, $2::jsonb, 'he')", [project, JSON.stringify(CONTACTS.slice(0, 1))]);
    assert.deepEqual(await rows("select person_id from public.project_contacts"), [{ person_id: "p-alice" }]);
  });
});

describe("the migration, on a database that already has projects", () => {
  it("gives every existing team member an id, and changes nothing else — not even 'last updated'", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const { PGlite } = await import("@electric-sql/pglite");
    const { SUPABASE_STUBS } = await import("./helpers/pg");
    const dir = path.join(process.cwd(), "supabase", "migrations");
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    const contacts = files.indexOf("20260929120000_contacts.sql");

    const old = new PGlite();
    await old.exec(SUPABASE_STUBS);
    for (const file of files.slice(0, contacts)) await old.exec(readFileSync(path.join(dir, file), "utf8"));
    const t = JSON.stringify(text("x"));
    await old.exec(`
      insert into public.projects (slug, name, tagline, short_description, vision, problem, desired_change, domains,
                                   lifecycle_stage, team, updated_at)
      values ('older', '${t}', '${t}', '${t}', '${t}', '${t}', '${t}', '{community}', 'idea',
              '[{"name": "A"}, {"id": "person-1", "name": "B"}, {"name": "C"}]', '2025-01-01T00:00:00Z');
    `);
    for (const file of files.slice(contacts)) await old.exec(readFileSync(path.join(dir, file), "utf8"));

    const { rows: [row] } = await old.query<{ team: { id: string; name: string }[]; updated_at: Date }>(
      "select team, updated_at from public.projects where slug = 'older'",
    );
    const ids = row.team.map((p) => p.id);
    assert.deepEqual(row.team.map((p) => p.name), ["A", "B", "C"]);
    assert.equal(ids[1], "person-1", "an existing id is kept");
    assert.equal(ids[2], "person-3");
    assert.match(ids[0], /^person-1-[0-9a-f]{6}$/, "never a taken id");
    assert.equal(new Set(ids).size, 3);
    assert.equal(row.updated_at.toISOString(), "2025-01-01T00:00:00.000Z");
    await old.close();
  });
});
