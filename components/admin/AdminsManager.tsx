"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Search, ShieldCheck, ShieldMinus, UserPlus } from "lucide-react";
import { grantAdmin, revokeAdmin, searchUsers } from "@/app/[lang]/admin/actions";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useLocale, useLocalePath, useMessages } from "@/components/LocaleProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import type { AdminGrant, UserMatch } from "@/lib/admin";
import { fmt } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";

type Grant = AdminGrant & { grantedOn: string; revokedOn: string | null };
type Person = { userId: string; email: string | null; name: string | null };

const who = (p: Person) => p.name || p.email || p.userId;

/**
 * The admin list, adding an admin (search a registered person, confirm) and revoking (confirm; revoking
 * yourself also needs a tick). The UI hides impossible actions, but the database is what refuses them.
 */
export function AdminsManager({ me, grants }: { me: string; grants: Grant[] }) {
  const router = useRouter();
  const locale = useLocale();
  const lp = useLocalePath();
  const messages = useMessages();
  const m = messages.admin.admins;

  const active = grants.filter((g) => !g.revokedAt);
  const history = grants.filter((g) => g.revokedAt);
  const onlyOne = active.length <= 1;

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserMatch[] | null>(null);
  const [searchNote, setSearchNote] = useState<string | null>(null);
  const [searching, startSearch] = useTransition();

  const [dialog, setDialog] = useState<{ kind: "grant" | "revoke"; person: Person } | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  function search(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      setSearchNote(m.tooShort);
      return;
    }
    setSearchNote(null);
    startSearch(async () => {
      const res = await searchUsers(q, locale);
      if (res.status === "ok") {
        setResults(res.users);
        setSearchNote(res.users.length ? null : m.noResults);
      } else {
        setResults(null);
        setSearchNote(res.error);
      }
    });
  }

  function confirm() {
    if (!dialog) return;
    const { kind, person } = dialog;
    setDialogError(null);
    start(async () => {
      const res = kind === "grant" ? await grantAdmin(person.userId, locale) : await revokeAdmin(person.userId, locale);
      if (res.status !== "ok") {
        setDialogError(res.error);
        return;
      }
      setDialog(null);
      if (kind === "revoke" && person.userId === me) {
        // No longer an admin: the admin area is closed from now on.
        router.push(lp("/"));
        router.refresh();
        return;
      }
      setNotice({ ok: true, text: fmt(kind === "grant" ? m.granted : m.revoked, { who: who(person) }) });
      setResults(null);
      setQuery("");
      router.refresh();
    });
  }

  const self = dialog?.kind === "revoke" && dialog.person.userId === me;

  return (
    <div className="space-y-14">
      {notice && (
        <p role="status" className={cn("rounded-2xl px-5 py-4 font-medium", notice.ok ? "bg-leaf-50 text-leaf-900" : "bg-need-50 text-need-700")}>
          {notice.text}
        </p>
      )}

      {/* active admins */}
      <section aria-labelledby="active-title">
        <h2 id="active-title" className="mb-4 font-display text-2xl font-semibold text-leaf-900">
          {m.activeTitle}
        </h2>
        <ul className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-white/70">
          {active.map((g) => (
            <li key={g.id} className="grid gap-3 p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
                  <ShieldCheck className="size-4 text-leaf-600" aria-hidden="true" />
                  {g.name || g.email || g.userId}
                  {g.userId === me && <span className="rounded-full bg-leaf-50 px-2 py-0.5 text-xs font-medium text-leaf-800">{m.you}</span>}
                </p>
                <dl className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-3">
                  {g.email && (
                    <div className="flex gap-1.5">
                      <dt className="sr-only">{m.colEmail}</dt>
                      <dd dir="ltr">{g.email}</dd>
                    </div>
                  )}
                  <div className="flex gap-1.5">
                    <dt>{m.colSince}:</dt>
                    <dd>{g.grantedOn}</dd>
                  </div>
                  <div className="flex gap-1.5">
                    <dt>{m.colBy}:</dt>
                    <dd>{g.grantedBy ? g.grantedBy.name || g.grantedBy.email || "—" : m.bootstrap}</dd>
                  </div>
                </dl>
              </div>
              <div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={onlyOne}
                  title={onlyOne ? m.onlyAdmin : undefined}
                  onClick={() => {
                    setDialogError(null);
                    setNotice(null);
                    setDialog({ kind: "revoke", person: g });
                  }}
                  className="text-need-700 hover:bg-need-50 hover:text-need-700"
                >
                  <ShieldMinus /> {m.revoke}
                </Button>
              </div>
            </li>
          ))}
        </ul>
        {onlyOne && <p className="mt-3 text-sm text-ink-3">{m.onlyAdmin}</p>}
      </section>

      {/* add */}
      <section aria-labelledby="add-title" className="rounded-3xl border border-line bg-white/70 p-6">
        <h2 id="add-title" className="font-display text-2xl font-semibold text-leaf-900">
          {m.addTitle}
        </h2>
        <p className="mt-2 text-sm text-ink-2">{m.addBody}</p>
        <form role="search" onSubmit={search} className="mt-5 flex flex-wrap gap-3">
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={m.searchPh}
            aria-label={m.searchPh}
            className="max-w-md flex-1"
          />
          <Button type="submit" size="lg" className="h-12" disabled={searching}>
            {searching ? <Loader2 className="animate-spin" /> : <Search />} {searching ? m.searching : m.search}
          </Button>
        </form>
        {searchNote && <p className="mt-3 text-sm text-ink-2">{searchNote}</p>}
        {results && results.length > 0 && (
          <ul className="mt-5 divide-y divide-line rounded-2xl border border-line bg-white">
            {results.map((u) => (
              <li key={u.userId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{u.name || u.email}</p>
                  {u.name && u.email && (
                    <p dir="ltr" className="text-start text-sm text-ink-3">
                      {u.email}
                    </p>
                  )}
                </div>
                {u.isAdmin ? (
                  <span className="text-sm font-medium text-leaf-700">{m.alreadyAdmin}</span>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setDialogError(null);
                      setNotice(null);
                      setDialog({ kind: "grant", person: u });
                    }}
                  >
                    <UserPlus /> {m.makeAdmin}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* history */}
      <section aria-labelledby="history-title">
        <h2 id="history-title" className="mb-4 font-display text-2xl font-semibold text-leaf-900">
          {m.historyTitle}
        </h2>
        {history.length === 0 ? (
          <p className="text-sm text-ink-3">{m.historyEmpty}</p>
        ) : (
          <ul className="space-y-2 text-sm text-ink-2">
            {history.map((g) => (
              <li key={g.id} className="rounded-2xl bg-paper-2/70 px-4 py-3">
                <span className="font-medium text-ink">{g.name || g.email || g.userId}</span>
                {g.email && g.name && (
                  <span dir="ltr" className="ms-2 text-ink-3">
                    {g.email}
                  </span>
                )}
                <span className="mt-1 block text-ink-3">
                  {fmt(m.historyItem, { granted: g.grantedOn, revoked: g.revokedOn ?? "" })}
                  {g.revokedBy && (g.revokedBy.name || g.revokedBy.email) && <> · {fmt(m.by, { name: (g.revokedBy.name || g.revokedBy.email)! })}</>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {dialog && (
        <ConfirmDialog
          title={
            dialog.kind === "grant"
              ? fmt(m.confirmGrantTitle, { who: who(dialog.person) })
              : self
                ? m.confirmSelfTitle
                : fmt(m.confirmRevokeTitle, { who: who(dialog.person) })
          }
          confirmLabel={dialog.kind === "grant" ? m.confirmGrant : m.confirmRevoke}
          cancelLabel={messages.admin.cancel}
          requireCheck={self ? m.selfCheck : undefined}
          pending={pending}
          error={dialogError}
          onConfirm={confirm}
          onClose={() => setDialog(null)}
        >
          {dialog.person.email && (
            <p dir="ltr" className="text-start font-medium text-ink">
              {dialog.person.name ? `${dialog.person.name} · ${dialog.person.email}` : dialog.person.email}
            </p>
          )}
          <p>
            {dialog.kind === "grant" ? m.confirmGrantBody : self ? m.confirmSelfBody : fmt(m.confirmRevokeBody, { who: who(dialog.person) })}
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
