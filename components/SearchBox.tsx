"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { NextArrow } from "@/components/Arrows";
import { useLocalePath, useMessages } from "@/components/LocaleProvider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SearchBoxProps {
  /** "hero": large, with animated examples. "compact": for the discover page. */
  size?: "hero" | "compact";
  defaultValue?: string;
  action?: string;
  /** Overrides the button text (defaults to the dictionary's). */
  cta?: string;
  showExamples?: boolean;
  className?: string;
}

/**
 * The conversational entry point. A plain GET form (works without JS) that
 * hands the sentence to /discover. The animated placeholder teaches by example.
 */
export function SearchBox({
  size = "hero",
  defaultValue = "",
  action = "/discover",
  cta,
  showExamples = true,
  className,
}: SearchBoxProps) {
  const m = useMessages().search;
  const lp = useLocalePath();
  const prompts = m.prompts;
  const [value, setValue] = useState(defaultValue);
  const [exampleIndex, setExampleIndex] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const hero = size === "hero";

  useEffect(() => {
    if (value) return;
    const id = setInterval(() => setExampleIndex((i) => (i + 1) % prompts.length), 3800);
    return () => clearInterval(id);
  }, [value, prompts.length]);

  return (
    <form action={lp(action)} method="get" className={cn("w-full", className)}>
      <div
        className={cn(
          "group relative rounded-[1.75rem] border border-line-2 bg-white shadow-lift transition-all focus-within:border-leaf-500 focus-within:ring-4 focus-within:ring-leaf-200/60",
          hero ? "p-2.5" : "p-2",
        )}
      >
        <label htmlFor="discover-q" className="sr-only">
          {m.label}
        </label>
        <div className="relative">
          <textarea
            id="discover-q"
            ref={inputRef}
            name="q"
            required
            rows={hero ? 2 : 1}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (value.trim()) e.currentTarget.form?.requestSubmit();
              }
            }}
            className={cn(
              "block w-full resize-none bg-transparent px-4 pt-3 text-ink focus:outline-none",
              hero ? "text-lg leading-relaxed sm:text-xl" : "text-base",
            )}
          />
          {!value && (
            <span
              key={exampleIndex}
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute inset-x-4 top-3 animate-rise text-ink-3/80",
                hero ? "text-lg leading-relaxed sm:text-xl" : "text-base",
              )}
            >
              {prompts[exampleIndex]}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-2 pb-1 pt-2">
          <span className="hidden items-center gap-1.5 ps-2 text-xs text-ink-3 sm:inline-flex">
            <Sparkles className="size-3.5 text-leaf-500" aria-hidden="true" />
            {m.hint}
          </span>
          <Button type="submit" size={hero ? "lg" : "md"} className="ms-auto">
            {cta ?? m.cta} <NextArrow />
          </Button>
        </div>
      </div>

      {showExamples && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-ink-3">{m.forExample}</span>
          {prompts.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                setValue(p);
                inputRef.current?.focus();
              }}
              className="rounded-full border border-line bg-white/60 px-3.5 py-1.5 text-start text-sm text-ink-2 transition-all hover:-translate-y-0.5 hover:border-leaf-300 hover:bg-white hover:text-leaf-800"
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </form>
  );
}
