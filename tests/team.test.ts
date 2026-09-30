/**
 * The wizard's team: several people, each with a private email, a role in both languages, and a stable id.
 *
 *   npm run test:team
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getMessagesFor } from "@/lib/i18n/messages";
import { projectToRows } from "@/lib/project-mapper";
import { projectSchema } from "@/lib/schema";
import { readSeedProjects } from "@/lib/seed-data";
import {
  applyDraft,
  buildProject,
  draftContacts,
  draftFromProject,
  draftSchema,
  emptyDraft,
  newItem,
  newPerson,
  personTextKey,
  readTexts,
  validateStep,
  writeTexts,
  type Draft,
} from "@/lib/wizard";
import { prepareNewProject } from "@/lib/wizard-server";

const errors = getMessagesFor("he").wizard.errors;

function draftOf(over: Partial<Draft> = {}): Draft {
  return {
    ...emptyDraft(),
    name: "Neighbors Learn",
    slug: "neighbors-learn",
    tagline: "t",
    short_description: "s",
    vision: "v",
    problem: "p",
    desired_change: "d",
    domains: ["education"],
    needs: [{ ...newItem("community"), title: "צורך" }],
    offers: [],
    people: [
      { ...newPerson({ name: "דנה", email: " Dana@Example.com " }), role: "מייסדת" },
      { ...newPerson({ name: "יואב", email: "yoav@example.org" }), role: "" },
    ],
    ...over,
  };
}

describe("the team in the wizard", () => {
  it("needs a name and a valid email for everyone who was filled in; empty rows are ignored", () => {
    const [a] = draftOf().people;
    assert.deepEqual(validateStep("details", draftOf(), errors), {});
    assert.deepEqual(validateStep("details", draftOf({ people: [a, newPerson()] }), errors), {}, "an untouched row");

    const noEmail = { ...a, email: "" };
    const badEmail = { ...a, uid: "u2", email: "dana at example" };
    const noName = { ...newPerson({ email: "x@y.org" }), uid: "u3" };
    const found = validateStep("details", draftOf({ people: [noEmail, badEmail, noName] }), errors);
    assert.deepEqual(found, {
      [`person:${a.uid}:email`]: errors.personEmail,
      "person:u2:email": errors.personEmailInvalid,
      "person:u3:name": errors.personName,
    });
  });

  it("puts names and roles on the public page, and the emails only in the private contacts", () => {
    const d = draftOf();
    const project = projectSchema.parse(buildProject(d, false, "he"));
    assert.deepEqual(
      project.people.stewards.map((s) => [s.id, s.name, s.role?.translations.he]),
      [
        [d.people[0].id, "דנה", "מייסדת"],
        [d.people[1].id, "יואב", undefined],
      ],
    );
    assert.ok(!JSON.stringify(project).includes("@"), "no email in the project");
    assert.deepEqual(draftContacts(d), [
      { person_id: d.people[0].id, email: "dana@example.com" },
      { person_id: d.people[1].id, email: "yoav@example.org" },
    ]);
  });

  it("sends the emails with the new project to the database — and a new project has no 'email optional' people", () => {
    const d = draftOf();
    const prepared = prepareNewProject(d, "en");
    assert.ok(prepared.ok);
    assert.deepEqual(prepared.args.p_contacts, draftContacts(d));
    assert.equal(prepared.args.p_locale, "en");
    assert.deepEqual(prepared.args.p_project.team.map((s) => s.id), d.people.map((p) => p.id));

    const sneaky = draftOf({ people: [{ ...d.people[0], email: "", emailOptional: true }] });
    const refused = prepareNewProject(sneaky);
    assert.equal(refused.ok, false);
  });

  it("translates each role on its own", () => {
    const d = draftOf();
    const key = personTextKey(d.people[0].uid);
    assert.equal(readTexts(d, "he", "he")[key], "מייסדת");
    const translated = writeTexts(d, "en", "he", { [key]: "Founder" }, { from: "he", at: "2026-09-30T10:00:00.000Z" });
    const project = buildProject(translated, false, "he");
    assert.deepEqual(project.people.stewards[0].role, {
      translations: { he: "מייסדת", en: "Founder" },
      machine: { en: { from: "he", at: "2026-09-30T10:00:00.000Z" } },
    });
  });

  it("upgrades a draft saved in a browser before teams existed", () => {
    const { people: _people, ...rest } = draftOf();
    void _people;
    const parsed = draftSchema.parse({ ...rest, steward_name: "דנה", steward_role: "מייסדת" });
    assert.equal(parsed.people.length, 1);
    assert.equal(parsed.people[0].name, "דנה");
    assert.equal(parsed.people[0].role, "מייסדת");
  });

  it("refuses two people with the same id", () => {
    const d = draftOf();
    assert.throws(() => draftSchema.parse({ ...d, people: [d.people[0], { ...d.people[1], id: d.people[0].id }] }));
  });
});

describe("editing a team", async () => {
  const { projects } = await readSeedProjects();
  const original = projects.find((p) => p.people.stewards.length >= 2)!;

  it("loads every person, with their email when the steward may see it; people without one may stay so", () => {
    const d = draftFromProject(original, "he", { "person-1": "first@example.com" });
    assert.equal(d.people.length, original.people.stewards.length);
    assert.deepEqual(d.people.map((p) => p.id), original.people.stewards.map((_, i) => `person-${i + 1}`));
    assert.equal(d.people[0].email, "first@example.com");
    assert.equal(d.people[0].emailOptional, undefined);
    assert.equal(d.people[1].emailOptional, true);
    assert.deepEqual(validateStep("details", d, errors), {});
  });

  it("keeps untouched people exactly as stored, and a changed person keeps their id", () => {
    const d = draftSchema.parse(draftFromProject(original, "he"));
    assert.deepEqual(applyDraft(original, d, "he").people, original.people);

    d.people[1].name = "שם חדש";
    d.people.push({ ...newPerson({ name: "חדשה", email: "new@example.org" }), role: "" });
    const next = projectSchema.parse(applyDraft(original, d, "he"));
    assert.deepEqual(next.people.stewards[0], original.people.stewards[0]);
    assert.equal(next.people.stewards[1].id, "person-2");
    assert.equal(next.people.stewards[1].name, "שם חדש");
    assert.deepEqual(next.people.stewards[1].role, original.people.stewards[1].role);
    assert.equal(next.people.stewards.at(-1)!.name, "חדשה");

    // Stored, everyone has an id.
    const team = projectToRows(next).project.team;
    assert.equal(new Set(team.map((s) => s.id)).size, team.length);
  });

  it("removing a person removes them from the team", () => {
    const d = draftSchema.parse(draftFromProject(original, "he"));
    d.people = d.people.slice(1);
    const next = applyDraft(original, d, "he");
    assert.equal(next.people.stewards.length, original.people.stewards.length - 1);
    assert.ok(!next.people.stewards.some((s) => s.name === original.people.stewards[0].name));
  });
});
