import type { Html } from "@effect/ui/html"

// Shorter than the row, so the cursor on it stands out.
const divider = [
  "before:absolute before:inset-y-2 before:left-0 before:w-px",
  "before:bg-border-strong before:content-['']"
].join(" ")

/**
 * A slider drawn as a row of `cells` cells with a cursor on the
 * dividers between them. `value` counts the cells to the left of the
 * cursor, which are tinted: 0 puts it before the first cell and `cells`
 * after the last. The cursor is the thumb of a native range input laid
 * over the cells, so dragging, clicking and the arrow keys all work as
 * they do on any slider.
 */
export const Scrubber = <M>(
  h: Html.H<M>,
  options: {
    readonly label: string
    readonly valueText: string
    readonly value: number
    readonly cells: number
    readonly disabled?: boolean | undefined
    readonly onInput: (value: string) => M
  }
) =>
  h.div.class("relative h-8 min-w-0").children(
    h.div.class(
      "absolute inset-0 grid auto-cols-fr grid-flow-col overflow-hidden",
      "rounded-md border border-border-strong bg-background"
    ).attr("aria-hidden", "true").children(
      ...Array.from({ length: options.cells }, (_, index) =>
        h.span.key(String(index)).class(
          "relative",
          index > 0 && divider,
          index < options.value && "bg-wash",
          "motion-safe:transition-[background-color]",
          "motion-safe:duration-150"
        ))
    ),
    // Wider than the cells by half a cursor on each side, which puts
    // the cursor's centre on a divider at every stop, and taller, so
    // the cursor stands clear of the row.
    h.input.class(
      "scrubber-input absolute -inset-x-[3px] -inset-y-1",
      "h-[calc(100%+8px)] w-[calc(100%+6px)]"
    ).attrs({
      type: "range",
      min: "0",
      max: String(options.cells),
      step: "1",
      "aria-label": options.label,
      "aria-valuetext": options.valueText
    }).disabled(options.disabled === true).value(
      String(options.value)
    ).onInput(({ value }) =>
      options.onInput(value)
    )
  )
