// The classes of a strip of tabs along the top of a card, for the
// parts of the kit's Tabs. The active tab has the panel's background
// and covers the line under the strip, so the tab and its panel read
// as one sheet.

export const strip = [
  "flex items-stretch justify-between gap-3 border-b border-border",
  "bg-muted pr-2"
].join(" ")

// A pixel to the left, which tucks the first tab's left border under
// the card's.
export const list = "relative -ml-px flex"

// The active tab's background, which slides to the next tab.
export const indicator = [
  "absolute top-0 -bottom-px left-(--active-tab-left)",
  "w-(--active-tab-width) border-x border-border bg-card",
  "motion-safe:transition-[left,width] motion-safe:duration-200"
].join(" ")

export const tab = [
  "relative cursor-pointer px-4 py-2.5 text-control font-medium",
  "whitespace-nowrap text-muted-foreground hover:text-foreground",
  "focus-visible:-outline-offset-2 focus-visible:outline-accent",
  "data-active:text-foreground",
  "motion-safe:transition-colors motion-safe:duration-150"
].join(" ")
