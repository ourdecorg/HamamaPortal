import {
  BookOpen,
  Compass,
  Coins,
  Cpu,
  Database,
  FlaskConical,
  Handshake,
  HandHeart,
  MessagesSquare,
  PenTool,
  Sparkles,
  Users,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import { exchangeType } from "@/lib/taxonomy";

const ICONS: Record<string, LucideIcon> = {
  Users,
  BookOpen,
  HandHeart,
  Cpu,
  Coins,
  Warehouse,
  Handshake,
  FlaskConical,
  Compass,
  Database,
  PenTool,
  MessagesSquare,
  Sparkles,
};

/** The small icon for a need/offer type ("community", "knowledge", …). */
export function TypeIcon({ type, className }: { type: string; className?: string }) {
  const Icon = ICONS[exchangeType(type).icon] ?? Sparkles;
  return <Icon aria-hidden="true" className={className ?? "size-4"} />;
}
