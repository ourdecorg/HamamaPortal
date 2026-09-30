import { BadgeCheck } from "lucide-react";
import { ContactActions } from "@/components/ContactActions";
import { getCurrentUser } from "@/lib/auth";
import { getProjectPeople } from "@/lib/contacts";
import type { ConversationKind } from "@/lib/conversation";
import { fmt } from "@/lib/i18n/format";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { t } from "@/lib/locale";
import { isMailConfigured } from "@/lib/mail/config";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { Project } from "@/types/project";

/**
 * The people who look after an initiative, with a mark for those registered on the portal and a way to reach
 * them: email for anyone with an address, chat for registered people too. Nobody's address is ever sent to the
 * page — only whether they can be reached.
 */
export async function TeamList({ project, autoOpen }: { project: Project; autoOpen?: { personId: string; kind: ConversationKind } }) {
  const locale = await getLocale();
  const messages = await getMessages();
  const m = messages.project;
  const c = messages.contact;
  const persist = isSupabaseConfigured();
  const [people, user] = await Promise.all([getProjectPeople(project.id), getCurrentUser()]);
  const canEmail = persist && isMailConfigured();
  const projectName = t(project.name, locale);

  if (!project.people.stewards.length) return <p className="text-sm text-ink-3">{m.noStewards}</p>;

  return (
    <ul className="space-y-4">
      {project.people.stewards.map((s, i) => {
        const contact = s.id ? people[s.id] : undefined;
        const reachable = Boolean(contact?.contactable && !contact.isMe);
        const email = reachable && canEmail;
        const chat = reachable && Boolean(contact?.registered);
        return (
          <li key={s.id ?? `${s.name}-${i}`} className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="grid size-11 shrink-0 place-items-center rounded-full bg-leaf-100 font-display text-lg font-semibold text-leaf-800"
            >
              {s.name.trim()[0]}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 font-medium text-ink">
                {s.name}
                {contact?.registered && (
                  <span title={fmt(c.registeredTitle, { name: s.name })} className="inline-flex text-leaf-600">
                    <BadgeCheck className="size-4" aria-hidden="true" />
                    <span className="sr-only">{c.registered}</span>
                  </span>
                )}
              </span>
              {s.role && <span className="text-sm text-ink-2">{t(s.role, locale)}</span>}
            </span>
            {(email || chat) && s.id && (
              <ContactActions
                target={{ projectId: project.id, personId: s.id, personName: s.name, projectName }}
                slug={project.slug}
                email={email}
                chat={chat}
                signedIn={Boolean(user)}
                autoOpen={autoOpen?.personId === s.id && (autoOpen.kind === "chat" ? chat : email) ? autoOpen.kind : undefined}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
