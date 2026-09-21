import { cn } from "@/lib/utils";

export function SectionHeading({
  eyebrow,
  title,
  description,
  as: Tag = "h2",
  align = "start",
  className,
  id,
}: {
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  as?: "h1" | "h2" | "h3";
  align?: "start" | "center";
  className?: string;
  id?: string;
}) {
  return (
    <div className={cn("mb-10 max-w-2xl", align === "center" && "mx-auto text-center", className)}>
      {eyebrow && <p className="mb-3 text-sm font-semibold tracking-wide text-leaf-600">{eyebrow}</p>}
      <Tag id={id} className="font-display text-3xl font-semibold leading-tight text-leaf-900 sm:text-[2.6rem] sm:leading-[1.15]">
        {title}
      </Tag>
      {description && <p className="mt-4 text-lg leading-relaxed text-ink-2">{description}</p>}
    </div>
  );
}
