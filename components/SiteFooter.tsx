import Link from "next/link";
import { Wordmark } from "@/components/Logo";

const PRINCIPLES = [
  { title: "מבנה לפני חכמה", body: "הכול נשען על מידע מסודר. אחר כך אפשר להוסיף בינה." },
  { title: "כל המלצה מסבירה למה", body: "לא תראו כאן ציון בלי הסבר." },
  { title: "המערכת מציעה, אנשים מחליטים", body: "חיבור הוא הזמנה לשיחה, לא הכרעה." },
];

export function SiteFooter() {
  return (
    <footer className="mt-28 border-t border-line bg-paper-2/60">
      <div className="page-wrap grid gap-12 py-14 md:grid-cols-[1.2fr_1fr_1fr]">
        <div className="space-y-4">
          <Wordmark showSubtitle={false} />
          <p className="max-w-sm text-[0.95rem] text-ink-2">
            תשתית לפעולה משותפת. מקום שבו מיזמי עתיד מוצאים זה את זה — מה הם מנסים לשנות, מה הם צריכים, ומה הם יכולים להציע.
          </p>
          <p className="text-xs text-ink-3" dir="ltr">
            Future Initiatives Portal · Infrastructure for Collective Agency
          </p>
        </div>

        <div>
          <h2 className="mb-4 font-sans text-sm font-semibold text-ink">להתחיל מכאן</h2>
          <ul className="space-y-2.5 text-[0.95rem] text-ink-2">
            <li><Link className="hover:text-leaf-700" href="/projects">גלו מיזמים</Link></li>
            <li><Link className="hover:text-leaf-700" href="/connections">חיבורים שהמערכת מזהה</Link></li>
            <li><Link className="hover:text-leaf-700" href="/wishes">הביעו משאלה</Link></li>
            <li><Link className="hover:text-leaf-700" href="/projects/new">הוסיפו מיזם</Link></li>
          </ul>
        </div>

        <div>
          <h2 className="mb-4 font-sans text-sm font-semibold text-ink">איך אנחנו עובדים</h2>
          <ul className="space-y-3 text-sm text-ink-2">
            {PRINCIPLES.map((p) => (
              <li key={p.title}>
                <span className="font-medium text-ink">{p.title}. </span>
                {p.body}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-line/80">
        <p className="page-wrap py-5 text-xs leading-relaxed text-ink-3">
          גרסת דמו: המיזמים, האנשים והקישורים באתר הם תוכן לדוגמה שנכתב לצורך הצגת הרעיון, ואינם מייצגים מיזמים או אנשים אמיתיים.
        </p>
      </div>
    </footer>
  );
}
