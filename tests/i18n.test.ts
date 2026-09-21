/**
 * Multilingual support: URL handling, the dictionaries, and that the engines write in the requested language.
 * Pure functions only — no server, no database.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_LOCALE,
  LOCALES,
  hasLocale,
  isUnlocalizedPath,
  localePath,
  negotiateLocale,
  splitLocale,
} from "@/lib/i18n/config";
import { fmt, joinList, plural } from "@/lib/i18n/format";
import { getMessagesFor } from "@/lib/i18n/messages";
import { discover } from "@/lib/discovery";
import { findConnections } from "@/lib/matching";
import { readSeedProjects } from "@/lib/seed-data";
import { loginUrl } from "@/lib/next-path";
import { t } from "@/lib/locale";
import { applyDraft, buildProject, draftFromProject, emptyDraft } from "@/lib/wizard";
import { prepareNewProject } from "@/lib/wizard-server";

const HEBREW = /[א-ת]/;

describe("locale URLs", () => {
  it("prefixes site paths with the language, once", () => {
    assert.equal(localePath("en", "/projects"), "/en/projects");
    assert.equal(localePath("he", "/"), "/he");
    assert.equal(localePath("en", "/projects?domain=x#top"), "/en/projects?domain=x#top");
    assert.equal(localePath("en", "/en/projects"), "/en/projects");
    assert.equal(localePath("en", "/he/projects"), "/he/projects", "an explicit language is never rewritten");
  });

  it("leaves anything that is not a site path alone", () => {
    assert.equal(localePath("en", "#stewardship"), "#stewardship");
    assert.equal(localePath("en", "https://example.com/x"), "https://example.com/x");
    assert.equal(localePath("en", "//evil.example"), "//evil.example");
    assert.equal(localePath("en", "/auth/callback?code=1"), "/auth/callback?code=1");
    assert.equal(localePath("en", "/api/projects"), "/api/projects");
    assert.ok(isUnlocalizedPath("/auth/callback") && isUnlocalizedPath("/api/projects"));
    assert.ok(!isUnlocalizedPath("/en/auth/callback"));
  });

  it("splits a URL into language and page", () => {
    assert.deepEqual(splitLocale("/en/projects/x?y=1"), { locale: "en", path: "/projects/x?y=1" });
    assert.deepEqual(splitLocale("/he"), { locale: "he", path: "/" });
    assert.deepEqual(splitLocale("/projects"), { locale: null, path: "/projects" });
    assert.deepEqual(splitLocale("/english/x"), { locale: null, path: "/english/x" }, "only whole segments count");
  });

  it("recognises supported languages only", () => {
    assert.ok(hasLocale("he") && hasLocale("en"));
    assert.ok(!hasLocale("fr") && !hasLocale("") && !hasLocale(undefined) && !hasLocale("EN"));
  });

  it("builds a sign-in URL that comes back to the same language", () => {
    assert.equal(loginUrl("/my-space", "en"), "/en/login?next=%2Fen%2Fmy-space");
    assert.equal(loginUrl("/en/my-space", "en"), "/en/login?next=%2Fen%2Fmy-space", "no double prefix");
    assert.equal(loginUrl("https://evil.example", "en"), "/en/login?next=%2Fen");
  });
});

describe("Accept-Language negotiation", () => {
  it("honours the order of preference", () => {
    assert.equal(negotiateLocale("en-US,en;q=0.9,he;q=0.8"), "en");
    assert.equal(negotiateLocale("he-IL,he;q=0.9,en;q=0.8"), "he");
    assert.equal(negotiateLocale("fr-FR,fr;q=0.9,en;q=0.5"), "en", "skips unsupported languages");
    assert.equal(negotiateLocale("en;q=0.5, he;q=0.9"), "he", "q values beat order");
  });

  it("understands the legacy Hebrew code, and gives up gracefully", () => {
    assert.equal(negotiateLocale("iw"), "he");
    assert.equal(negotiateLocale("fr,de"), null);
    assert.equal(negotiateLocale(""), null);
    assert.equal(negotiateLocale(null), null);
    assert.equal(negotiateLocale("en;q=0"), null, "q=0 means not acceptable");
  });
});

describe("formatting helpers", () => {
  it("fills placeholders and keeps unknown ones visible", () => {
    assert.equal(fmt("{a} and {b}", { a: "x", b: 2 }), "x and 2");
    assert.equal(fmt("{a} {missing}", { a: "x" }), "x {missing}");
  });

  it("chooses the plural form", () => {
    const m = { one: "{n} initiative", other: "{n} initiatives" };
    assert.equal(plural(m, 1), "1 initiative");
    assert.equal(plural(m, 0), "0 initiatives");
    assert.equal(plural(m, 12), "12 initiatives");
  });

  it("joins lists the way each language does", () => {
    assert.equal(joinList(["a", "b", "c"], "he"), "a, b וc");
    assert.equal(joinList(["a", "b", "c"], "en"), "a, b, and c");
    assert.equal(joinList(["a", "b"], "en"), "a and b");
    assert.equal(joinList(["a"], "en"), "a");
  });
});

/** Every string in a dictionary, with its path. */
function strings(value: unknown, path = ""): [string, string][] {
  if (typeof value === "string") return [[path, value]];
  if (Array.isArray(value)) return value.flatMap((v, i) => strings(v, `${path}[${i}]`));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => strings(v, path ? `${path}.${k}` : k));
  }
  return [];
}

/** Placeholder names in a template. Hebrew prefix variants ("b_vav") count as their base name ("b"). */
function placeholders(text: string): Set<string> {
  return new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1].replace(/_(vav|lamed|bet)$/, "")));
}

describe("dictionaries", () => {
  const he = strings(getMessagesFor("he"));
  const en = new Map(strings(getMessagesFor("en")));

  it("have the same keys (the type checker enforces this too)", () => {
    assert.deepEqual([...en.keys()].sort(), he.map(([k]) => k).sort());
  });

  it("use the same placeholders in every language", () => {
    for (const [path, text] of he) {
      const other = en.get(path) ?? "";
      assert.deepEqual([...placeholders(other)].sort(), [...placeholders(text)].sort(), `placeholders differ at ${path}`);
    }
  });

  it("leave no English key untranslated by accident, and no Hebrew in the English file", () => {
    for (const [path, text] of en) {
      // Names of the other language shown on purpose (the switch link) and Hebrew prefix helpers are fine.
      if (path === "nav.switchToAria") continue;
      assert.ok(!HEBREW.test(text), `Hebrew text in the English dictionary at ${path}`);
    }
  });

  it("fall back to Hebrew for an unknown language", () => {
    assert.equal(getMessagesFor("xx"), getMessagesFor(DEFAULT_LOCALE));
    assert.equal(getMessagesFor(undefined), getMessagesFor("he"));
    assert.deepEqual([...LOCALES], ["he", "en"]);
  });
});

describe("the engines write in the requested language", async () => {
  const { projects } = await readSeedProjects();

  it("connections: Hebrew by default, English on request — same connections either way", () => {
    const hebrew = findConnections(projects);
    const english = findConnections(projects, "en");
    assert.ok(hebrew.length > 0);
    assert.deepEqual(english.map((c) => c.id), hebrew.map((c) => c.id), "the language never changes WHICH connections exist");

    const c = english[0];
    for (const text of [c.summary, ...c.reasons.map((r) => r.text), ...c.unknowns, ...c.next_steps.flatMap((s) => [s.label, s.hint])]) {
      assert.ok(!HEBREW.test(text), `unexpected Hebrew in an English explanation: ${text}`);
    }
    assert.ok(c.summary.startsWith("This connection is suggested because"), c.summary);
    assert.ok(HEBREW.test(hebrew[0].summary));
  });

  it("discovery: interpretation, reasons and actions follow the language", async () => {
    const query = "I want to find initiatives about local communities and neighbors";
    const english = await discover({ query, projects, locale: "en" });
    const hebrew = await discover({ query, projects, locale: "he" });

    assert.deepEqual(english.matches.map((m) => m.project.id), hebrew.matches.map((m) => m.project.id));
    assert.ok(!HEBREW.test(english.interpretation.summary), english.interpretation.summary);
    assert.ok(english.interpretation.topics.every((topic) => !HEBREW.test(topic.label)));
    for (const reasons of Object.values(english.reasons)) for (const r of reasons) assert.ok(!HEBREW.test(r.text), r.text);
    for (const a of english.suggested_actions) assert.ok(!HEBREW.test(a.label + (a.hint ?? "")), a.label);
    assert.ok(HEBREW.test(hebrew.interpretation.summary));
  });
});

describe("what people type is stored in the language they typed it in", () => {
  const draft = () => ({
    ...emptyDraft(),
    name: "Neighbours Learning",
    slug: "neighbours-learning",
    tagline: "Every street is a classroom",
    short_description: "Small learning circles between neighbours.",
    vision: "Streets where everyone learns from everyone.",
    problem: "Knowledge stays locked inside homes.",
    desired_change: "One circle per street.",
    domains: ["education"],
  });

  it("creates an English project with English text", () => {
    const project = buildProject(draft(), false, "en");
    assert.equal(project.name.translations.en, "Neighbours Learning");
    assert.equal(project.name.translations.he, undefined);
    assert.equal(t(project.tagline, "en"), "Every street is a classroom");
    assert.equal(t(project.tagline, "he"), "Every street is a classroom", "no Hebrew yet, so Hebrew visitors see the English text");

    const prepared = prepareNewProject(draft(), "en");
    assert.ok(prepared.ok, prepared.ok ? "" : prepared.error);
  });

  it("returns validation messages in the visitor's language", () => {
    const en = prepareNewProject({ ...draft(), slug: "new" }, "en");
    assert.ok(!en.ok && /reserved/.test(en.error), en.ok ? "" : en.error);
    const he = prepareNewProject({ ...draft(), slug: "new" });
    assert.ok(!he.ok && HEBREW.test(he.error));
  });

  it("an English edit adds an English text and leaves the Hebrew untouched", async () => {
    const { projects } = await readSeedProjects();
    const original = projects[0];
    const before = draftFromProject(original, "en");
    const edited = applyDraft(original, { ...before, tagline: "A brand new English tagline" }, "en");

    assert.equal(edited.tagline.translations.en, "A brand new English tagline");
    assert.equal(edited.tagline.translations.he, original.tagline.translations.he, "Hebrew text is preserved");
    assert.equal(edited.tagline.default, original.tagline.default, "the default text is never overwritten from another language");
    // Nothing else moved: an unchanged draft is a no-op in any language.
    assert.deepEqual(applyDraft(original, before, "en"), original);
  });
});
