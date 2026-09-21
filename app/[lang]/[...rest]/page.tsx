import { notFound } from "next/navigation";

/**
 * Any URL under a language that no page matches ("/en/nothing-here") lands here, so the 404 is rendered
 * inside the localized layout, in the visitor's language.
 */
export default function UnknownPage(): never {
  notFound();
}
