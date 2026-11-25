import { Slider } from "@effect/ui-kit"
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
 * after the last. The kit's Slider handles dragging, clicking and the
 * arrow keys.
 */
export const Scrubber = <M>(
  h: Html.H<M>,
  options: {
    readonly label: string
    readonly valueText: string
    readonly value: number
    readonly cells: number
    readonly disabled?: boolean | undefined
    readonly onMove: (value: number) => M
  }
) =>
  Slider(h, {
    props: {
      value: options.value,
      max: options.cells,
      disabled: options.disabled === true
    },
    onEmit: {
      Moved: ({ value }) =>
        typeof value === "number" ? options.onMove(value) : undefined,
      Committed: () => undefined
    },
    view: (slider) =>
      slider.root(h.div.class("min-w-0")).children(
        slider.control(
          h.div.class(
            "relative h-8 touch-none rounded-md",
            // The control captures the pointer while dragging, so its
            // cursor is the one that shows.
            "data-dragging:cursor-grabbing",
            "has-focus-visible:outline-2",
            "has-focus-visible:outline-offset-2",
            "has-focus-visible:outline-accent"
          )
        ).children(
          slider.track(
            h.div.class(
              "absolute inset-0 grid auto-cols-fr grid-flow-col",
              "overflow-hidden rounded-md border border-border-strong",
              "bg-background"
            )
          ).children(
            slider.indicator(
              h.span.class(
                "absolute inset-y-0 left-(--slider-indicator-start)",
                "w-(--slider-indicator-size) bg-wash",
                "motion-safe:transition-[width]",
                "motion-safe:duration-150"
              )
            ),
            Array.from({ length: options.cells }, (_, index) =>
              h.span.key(String(index)).class(
                "relative",
                index > 0 && divider
              ))
          ),
          // 22px wide to give the pointer something to grab, and taller
          // than the row, so it stands clear of it. Only the 6px bar in
          // its middle shows, centred on a divider at every stop.
          slider.thumb({
            element: h.div.class(
              "absolute -inset-y-1 left-(--slider-thumb-position)",
              "w-[22px] -translate-x-1/2 cursor-grab",
              "data-dragging:cursor-grabbing",
              "data-disabled:cursor-default",
              "before:absolute before:inset-y-0 before:left-2",
              "before:w-1.5 before:rounded-[3px] before:bg-foreground",
              "before:content-['']",
              "before:[box-shadow:2px_0_0_var(--color-background),-2px_0_0_var(--color-background)]"
            ),
            input: h.input.attrs({
              "aria-label": options.label,
              "aria-valuetext": options.valueText
            })
          })
        )
      )
  })
