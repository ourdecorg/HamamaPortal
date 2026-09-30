import type { LocalizedText } from "@/types/project";

/**
 * Shapes of conversations (email and chat between people) as the database functions return them — see
 * supabase/migrations/20260929120000_contacts.sql. Types only: client components import them.
 */

export type ConversationKind = "email" | "chat";

/** How one person on an initiative's team can be contacted. Never their email. */
export interface PersonContact {
  registered: boolean;
  contactable: boolean;
  isMe: boolean;
}

export interface ConversationMessage {
  id: string;
  /** The participant who wrote it. */
  from: string | null;
  body: string;
  via: "app" | "email";
  at: string;
}

export interface ConversationView {
  id: string;
  kind: ConversationKind;
  subject: string | null;
  project: { id: string; slug: string; name: LocalizedText } | null;
  /** The viewer's participant id. */
  me: string;
  muted: boolean;
  participants: { id: string; name: string; is_me: boolean; registered: boolean }[];
  messages: ConversationMessage[];
}

export interface ConversationSummary {
  id: string;
  kind: ConversationKind;
  subject: string | null;
  project_slug: string | null;
  project_name: LocalizedText | null;
  other_name: string | null;
  last_body: string | null;
  last_at: string;
  last_from_me: boolean;
  unread: boolean;
}

/** Who is being contacted, for a conversation that may not exist yet. */
export interface ContactTarget {
  projectId: string;
  personId: string;
  personName: string;
  projectName: string;
}

export type ContactError = "failed" | "tooMany" | "optedOut" | "self" | "chatNeedsAccount" | "unavailable" | "invalid" | "mailUnavailable";

export type StartConversationResult =
  | { status: "ok"; conversationId: string }
  | { status: "auth_required" }
  | { status: "error"; error: ContactError };

export type SendMessageResult =
  | { status: "ok" }
  | { status: "auth_required" }
  | { status: "error"; error: ContactError };
