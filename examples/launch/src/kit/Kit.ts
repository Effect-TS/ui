import type { Html } from "@effect/ui/html"
import { components, extras } from "./components.ts"

// In columns, so the names read down each one in alphabetical order.
const names = [
  "columns-2 gap-x-6 font-mono text-[0.8125rem]/[1.9]",
  "font-features-[normal] min-[560px]:columns-3",
  "min-[760px]:columns-4 compact:text-[0.75rem]/[1.9]"
].join(" ")

const Names = <M>(h: Html.H<M>, list: ReadonlyArray<string>) =>
  h.ul.class(names).children(
    list.map((name) =>
      h.li.key(name).class("truncate").children(name)
    )
  )

/**
 * Every module of the UI kit by name: the components, then the rest.
 */
export const Kit = <M>(h: Html.H<M>) =>
  h.figure.class(
    "mx-auto my-8 max-w-(--column) rounded-lg border border-border",
    "bg-card px-5 py-4 [p+&]:mt-[1.4em] compact:px-4"
  ).attr("aria-label", "The components of the UI kit").children(
    Names(h, components),
    h.p.class(
      "mt-4 border-t border-border pt-4 font-mono text-[0.6875rem]",
      "tracking-[0.08em] uppercase text-muted-foreground",
      "font-features-[normal]"
    ).children("Also in the kit"),
    h.div.class("mt-1.5").children(Names(h, extras))
  )
