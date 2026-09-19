import type { Metadata } from "next";
import { ProjectWizard } from "@/components/ProjectWizard";

export const metadata: Metadata = {
  title: "הוספת מיזם",
  description: "תארו מיזם: מה הוא מנסה לשנות, מה הוא צריך ומה הוא מציע. בסוף תקבלו קובץ JSON.",
};

export default function NewProjectPage() {
  return (
    <div className="page-wrap pb-10 pt-12 sm:pt-16">
      <header className="mb-12 max-w-2xl">
        <p className="mb-3 text-sm font-semibold tracking-wide text-leaf-600">הוספת מיזם</p>
        <h1 className="font-display text-4xl font-black leading-tight text-leaf-900 sm:text-6xl">בואו נכיר את המיזם שלכם.</h1>
      </header>
      <ProjectWizard />
    </div>
  );
}
