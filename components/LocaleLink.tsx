"use client";

import NextLink from "next/link";
import type { ComponentProps } from "react";
import { useLocale } from "@/components/LocaleProvider";
import { localePath } from "@/lib/i18n/config";

/**
 * next/link that keeps the visitor in their language: "/projects" becomes "/en/projects". Import this
 * instead of next/link everywhere in the app. Already-prefixed paths, "#hash" links and external URLs
 * are left alone.
 */
export function Link({ href, ...props }: ComponentProps<typeof NextLink>) {
  const locale = useLocale();
  return <NextLink href={typeof href === "string" ? localePath(locale, href) : href} {...props} />;
}
