/**
 * Bilingual texts in the wizard, and the automatic-translation client — without calling OpenAI
 * (fetch is replaced by a fake).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getMessagesFor } from "@/lib/i18n/messages";
import { projectSchema } from "@/lib/schema";
import { readSeedProjects } from "@/lib/seed-data";
import { allowTranslation, translateItems, translationInstructions } from "@/lib/translation";
import {
  applyDraft,
  buildProject,
  draftFromProject,
  draftSchema,
  emptyDraft,
  itemTextKey,
  machineMark,
  readTexts,
  translationSource,
  validateStep,
  writeTexts,
  type Draft,
} from "@/lib/wizard";
import { prepareNewProject } from "@/lib/wizard-server";
import type { Project } from "@/types/project";

const AT = "2026-09-25T10:00:00.000Z";

const hebrewDraft = (): Draft => {
  const d = emptyDraft();
  return {
    ...d,
    name: "שכנים לומדים",
    slug: "neighbours",
    tagline: "כל רחוב הוא כיתה",
    short_description: "מעגלי למידה קטנים בין שכנים.\n\nפסקה שנייה.",
    vision: "רחובות שבהם כולם לומדים מכולם.",
    problem: "הידע נשאר בבתים.",
    desired_change: "מעגל אחד בכל רחוב.",
    domains: ["education"],
    needs: [{ ...d.needs[0], title: "מתנדבים", description: "עשרה אנשים לפיילוט" }],
    offers: [{ ...d.offers[0], title: "", description: "" }],
  };
};

/** What a translation of the Hebrew draft into English would write. */
function withEnglish(d: Draft, mark = true): Draft {
  const source = translationSource(d, "he", "he");
  const english = Object.fromEntries(Object.keys(source).map((key) => [key, `EN ${key}`]));
  return writeTexts(d, "en", "he", english, mark ? { from: "he", at: AT } : undefined);
}

describe("bilingual drafts", () => {
  it("never sends the name, or empty texts, to be translated", () => {
    const draft = hebrewDraft();
    const source = translationSource(draft, "he", "he");
    assert.ok(!("name" in source));
    assert.ok(!("place" in source));
    assert.equal(source.tagline, "כל רחוב הוא כיתה");
    const need = draft.needs[0];
    assert.equal(source[itemTextKey("need", need.uid, "title")], "מתנדבים");
  });

  it("stores the translation next to the original, which stays exactly as typed", () => {
    const original = hebrewDraft();
    const d = withEnglish(original);
    assert.deepEqual(readTexts(d, "he", "he"), readTexts(original, "he", "he"), "the Hebrew is untouched");

    const project = projectSchema.parse(buildProject(d, false, "he"));
    assert.equal(project.tagline.translations.he, "כל רחוב הוא כיתה");
    assert.equal(project.tagline.translations.en, "EN tagline");
    assert.deepEqual(project.tagline.machine, { en: { from: "he", at: AT } });
    assert.equal(project.short_description.translations.he, "מעגלי למידה קטנים בין שכנים.\n\nפסקה שנייה.");
    assert.equal(project.current_needs[0].description.translations.en, `EN ${itemTextKey("need", d.needs[0].uid, "description")}`);
    assert.equal(project.name.default, "שכנים לומדים");
    assert.equal(project.name.translations.en, undefined, "the name is not translated");
    assert.equal(project.offers.length, 0, "an empty offer stays out in every language");
  });

  it("a text edited by hand is no longer marked as an automatic translation", () => {
    const d = writeTexts(withEnglish(hebrewDraft()), "en", "he", { tagline: "Every street is a classroom" });
    assert.equal(machineMark(d, "en", "tagline"), undefined);
    assert.ok(machineMark(d, "en", "vision"));
    const project = buildProject(d, false, "he");
    assert.equal(project.tagline.machine, undefined);
    assert.deepEqual(project.vision.future_world.machine, { en: { from: "he", at: AT } });
  });

  it("a new English project gets a Hebrew version the same way", () => {
    const d = writeTexts({ ...emptyDraft(), tagline: "Every street is a classroom" }, "he", "en", { tagline: "כל רחוב הוא כיתה" }, { from: "en", at: AT });
    const project = buildProject(d, false, "en");
    assert.equal(project.tagline.translations.en, "Every street is a classroom");
    assert.equal(project.tagline.translations.he, "כל רחוב הוא כיתה");
    assert.deepEqual(project.tagline.machine, { he: { from: "en", at: AT } });
  });

  it("the server accepts a bilingual draft, and old drafts without translations", () => {
    const prepared = prepareNewProject(withEnglish(hebrewDraft()));
    assert.ok(prepared.ok, prepared.ok ? "" : prepared.error);
    assert.equal(prepared.args.p_project.tagline.translations.en, "EN tagline");

    const { translations: _t, machine: _m, ...old } = hebrewDraft();
    void _t;
    void _m;
    const parsed = draftSchema.parse(old);
    assert.deepEqual(parsed.translations, {});
    assert.deepEqual(parsed.machine, {});
  });
});

describe("editing both languages of an existing project", async () => {
  const { projects } = await readSeedProjects();
  const original = projects.find((p) => p.tagline.translations.he && p.tagline.translations.en && p.current_needs.length)!;

  it("shows each language's own text, and saving an untouched draft changes nothing", () => {
    const d = draftFromProject(original, "he");
    assert.equal(d.tagline, original.tagline.translations.he);
    assert.equal(d.translations.en?.tagline, original.tagline.translations.en);
    assert.deepEqual(applyDraft(original, draftSchema.parse(d), "he"), original);
  });

  it("an edit of the English version leaves the Hebrew alone, and the other way round", () => {
    const d = draftFromProject(original, "he");
    const en = applyDraft(original, writeTexts(d, "en", "he", { tagline: "New English tagline" }), "he");
    assert.equal(en.tagline.translations.en, "New English tagline");
    assert.equal(en.tagline.translations.he, original.tagline.translations.he);

    const he = applyDraft(original, { ...d, tagline: "שורה חדשה" }, "he");
    assert.equal(he.tagline.translations.he, "שורה חדשה");
    assert.equal(he.tagline.translations.en, original.tagline.translations.en);
  });

  it("keeps the automatic-translation marks through a save, until the text is edited", () => {
    const d = draftFromProject(original, "he");
    const needKey = itemTextKey("need", d.needs[0].uid, "description");
    const translated = writeTexts(d, "en", "he", { tagline: "Machine tagline", [needKey]: "Machine need" }, { from: "he", at: AT });
    const saved = projectSchema.parse(applyDraft(original, translated, "he"));
    assert.deepEqual(saved.tagline.machine, { en: { from: "he", at: AT } });
    assert.deepEqual(saved.current_needs[0].description.machine, { en: { from: "he", at: AT } });
    assert.equal(saved.current_needs[0].id, original.current_needs[0].id, "the need keeps its identity");

    // Reopened later: the marks come back, and an unchanged save is still a no-op.
    const reopened = draftFromProject(saved, "he");
    assert.ok(machineMark(reopened, "en", "tagline"));
    assert.deepEqual(applyDraft(saved, reopened, "he"), saved);

    const edited = applyDraft(saved, writeTexts(reopened, "en", "he", { tagline: "Hand-written tagline" }), "he");
    assert.equal(edited.tagline.translations.en, "Hand-written tagline");
    assert.equal(edited.tagline.machine, undefined);
  });

  it("a project with no English yet shows empty English fields — and can still be saved from /en", () => {
    const hebrewOnly: Project = {
      ...original,
      tagline: { translations: { he: "רק בעברית" } },
    };
    const d = draftFromProject(hebrewOnly, "en");
    assert.equal(d.tagline, "", "no Hebrew fallback in the English field");
    assert.equal(d.translations.he?.tagline, "רק בעברית");
    const errors = getMessagesFor("en").wizard.errors;
    assert.deepEqual(validateStep("identity", d, errors), {});
    assert.deepEqual(applyDraft(hebrewOnly, d, "en"), hebrewOnly);

    const translated = applyDraft(hebrewOnly, { ...d, tagline: "Only in Hebrew" }, "en");
    assert.deepEqual(translated.tagline.translations, { he: "רק בעברית", en: "Only in Hebrew" });
  });

  it("a required text must exist in at least one language", () => {
    const d = draftFromProject(original, "he");
    const errors = getMessagesFor("he").wizard.errors;
    const empty = { ...d, tagline: "", translations: { en: { ...d.translations.en!, tagline: "" } } };
    assert.equal(validateStep("identity", empty, errors).tagline, errors.tagline);
  });
});

describe("the OpenAI translation client", () => {
  const request = {
    from: "he" as const,
    to: "en" as const,
    name: "שכנים לומדים",
    items: [
      { id: "tagline", text: "כל רחוב הוא כיתה" },
      { id: "vision", text: "שורה אחת\n\nשורה שתיים https://example.org" },
    ],
  };

  function fakeOpenAI(answer: unknown, status = 200) {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const body = status === 200 ? { choices: [{ message: { content: JSON.stringify(answer) } }] } : { error: { message: "nope" } };
      return new Response(JSON.stringify(body), { status });
    }) as unknown as typeof fetch;
    return { fetchFn, calls };
  }

  it("sends the texts with ids and gets every one back", async () => {
    const { fetchFn, calls } = fakeOpenAI({
      items: [
        { id: "vision", text: "Line one\n\nLine two https://example.org" },
        { id: "tagline", text: "Every street is a classroom" },
      ],
    });
    const res = await translateItems(request, { fetch: fetchFn, apiKey: "sk-test", model: "test-model" });
    assert.deepEqual(res, {
      ok: true,
      items: [
        { id: "tagline", text: "Every street is a classroom" },
        { id: "vision", text: "Line one\n\nLine two https://example.org" },
      ],
    });
    const body = JSON.parse(String(calls[0].init.body));
    assert.equal(body.model, "test-model");
    assert.equal((calls[0].init.headers as Record<string, string>).Authorization, "Bearer sk-test");
    assert.deepEqual(JSON.parse(body.messages[1].content), { items: request.items });
    assert.match(body.messages[0].content, /from Hebrew to English/);
    assert.match(body.messages[0].content, /"שכנים לומדים". Do not translate this name/);
  });

  it("treats a partial answer or an API error as a failure, and a missing key as unconfigured", async () => {
    const partial = fakeOpenAI({ items: [{ id: "tagline", text: "Every street is a classroom" }] });
    assert.deepEqual(await translateItems(request, { fetch: partial.fetchFn, apiKey: "k" }), { ok: false, reason: "failed" });

    const error = fakeOpenAI(null, 500);
    const quiet = console.error;
    console.error = () => {};
    try {
      assert.deepEqual(await translateItems(request, { fetch: error.fetchFn, apiKey: "k" }), { ok: false, reason: "failed" });
    } finally {
      console.error = quiet;
    }

    const saved = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      assert.deepEqual(await translateItems(request, { fetch: partial.fetchFn }), { ok: false, reason: "unconfigured" });
    } finally {
      if (saved !== undefined) process.env.OPENAI_API_KEY = saved;
    }
  });

  it("writes Hebrew instructions for the other direction", () => {
    assert.match(translationInstructions("en", "he", "Neighbours"), /from English to Hebrew/);
    assert.match(translationInstructions("en", "he", "Neighbours"), /niqqud/);
  });

  it("limits how often one person can translate", () => {
    const now = 1_000_000;
    let allowed = 0;
    for (let i = 0; i < 30; i++) if (allowTranslation("test-user", now + i)) allowed += 1;
    assert.equal(allowed, 20);
    assert.ok(allowTranslation("test-user", now + 11 * 60 * 1000), "the window moves on");
  });
});
