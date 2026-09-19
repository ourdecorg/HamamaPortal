import { AlertTriangle } from "lucide-react";
import { getLoadIssues } from "@/lib/projects";

/**
 * Development only: tells the person editing /data/projects which files were
 * skipped and why. In production a malformed file is silently left out, so
 * visitors never see a broken page.
 */
export async function DataIssuesNotice() {
  if (process.env.NODE_ENV === "production") return null;
  const issues = await getLoadIssues();
  if (!issues.length) return null;

  return (
    <div role="status" className="page-wrap pt-4" dir="ltr">
      <div className="rounded-2xl border border-need-200 bg-need-50 p-4 text-sm text-need-700">
        <p className="mb-2 flex items-center gap-2 font-semibold">
          <AlertTriangle className="size-4" /> {issues.length} project file(s) skipped (dev only notice)
        </p>
        <ul className="space-y-1 font-mono text-xs">
          {issues.map((i) => (
            <li key={i.file}>
              <strong>{i.file}</strong> — {i.message}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
