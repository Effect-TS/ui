import { Icon } from "#components/Icon"
import { Button, RadioGroup } from "@effect/ui-kit"
import type { Html } from "@effect/ui/html"
import type { Name, Scenario } from "./scenarios.ts"

const control = [
  "inline-flex cursor-pointer items-center justify-center gap-1.5",
  "rounded-md border px-3 py-1.5 text-control font-medium",
  "whitespace-nowrap font-features-[normal]",
  "focus-visible:outline-accent active:translate-y-px",
  "aria-disabled:cursor-default aria-disabled:opacity-40",
  "aria-disabled:active:translate-y-0",
  "motion-safe:transition-[background-color,border-color,color]",
  "motion-safe:duration-150"
].join(" ")

export const primary = [
  control,
  "border-foreground bg-foreground text-background",
  "hover:not-aria-disabled:border-prose-foreground",
  "hover:not-aria-disabled:bg-prose-foreground"
].join(" ")

export const secondary = [
  control,
  "border-border-strong bg-background text-foreground",
  "hover:not-aria-disabled:border-muted-foreground"
].join(" ")

const segment = [
  "min-w-11 cursor-pointer rounded-[5px] px-2.5 py-1 font-mono",
  "text-control font-medium text-muted-foreground",
  "font-features-[normal] hover:text-foreground",
  "focus-visible:outline-accent",
  "aria-checked:bg-background aria-checked:text-foreground",
  "aria-checked:[box-shadow:0_0_0_1px_var(--color-border-strong)]",
  "motion-safe:transition-[background-color,color]",
  "motion-safe:duration-150"
].join(" ")

// One choice of several, drawn as a row of segments. The kit's
// RadioGroup puts the chosen one in the Tab order, and the arrow keys
// move to the next and choose it.
export const Segmented = <M, A extends string>(
  h: Html.H<M>,
  options: {
    readonly label: string
    readonly items: ReadonlyArray<A>
    readonly value: A
    readonly text?: ((item: A) => string) | undefined
    readonly mono?: boolean | undefined
    readonly onPick: (item: A) => M
  }
) =>
  h.div.class("flex flex-col gap-1.5").children(
    h.span.class("text-sm font-medium").attr("aria-hidden", "true")
      .children(options.label),
    RadioGroup(h, {
      props: {
        value: options.value,
        items: options.items.map((value) => ({ value }))
      },
      onEmit: {
        Picked: ({ value }) => {
          const item = options.items.find((item) => item === value)
          return item === undefined ? undefined : options.onPick(item)
        }
      },
      view: (group) =>
        group.root(
          h.div.class(
            "inline-flex w-fit flex-wrap gap-0.5 rounded-md border",
            "border-border bg-muted p-0.5"
          ).attr("aria-label", options.label)
        ).children(
          ...options.items.map((item) =>
            group.radio({
              element: h.button.key(item).class(
                segment,
                options.mono === false && "font-sans"
              ),
              value: item
            }).children(options.text?.(item) ?? item)
          )
        )
    })
  )

export const SenderPicker = <M>(
  h: Html.H<M>,
  scenario: Scenario,
  choice: Name,
  onPick: (name: Name) => M
) =>
  Segmented(h, {
    label: scenario.label,
    items: scenario.choices,
    value: choice,
    onPick
  })

export interface TransportOptions<M> {
  readonly isPlaying: boolean
  readonly atStart: boolean
  readonly atEnd: boolean
  readonly play: M
  readonly pause: M
  readonly back: M
  readonly next: M
  readonly replay: M
  readonly playLabel?: string | undefined
}

// Play or pause, one step back or forward, and back to the start.
export const Transport = <M>(
  h: Html.H<M>,
  options: TransportOptions<M>
) =>
  h.div.class("flex flex-wrap items-center gap-1.5").attrs({
    role: "group",
    "aria-label": "Playback"
  }).children(
    Button(h, {
      onPress: options.isPlaying ? options.pause : options.play
    }).class(primary, "min-w-[6.5rem]").children(
      Icon(h, options.isPlaying ? "pause" : "play", {
        class: "size-3.5",
        filled: true
      }),
      options.isPlaying
        ? "Pause"
        : options.atEnd
        ? "Replay"
        : options.playLabel ?? "Play"
    ),
    Button(h, {
      onPress: options.back,
      props: {
        disabled: options.atStart,
        focusableWhenDisabled: true
      }
    }).class(secondary).attr("aria-label", "Back one step").children(
      Icon(h, "back"),
      h.span.class("diagram-narrow:hidden").attr(
        "aria-hidden",
        "true"
      )
        .children("Back")
    ),
    Button(h, {
      onPress: options.next,
      props: { disabled: options.atEnd, focusableWhenDisabled: true }
    }).class(secondary).attr("aria-label", "Next step").children(
      h.span.class("diagram-narrow:hidden").attr(
        "aria-hidden",
        "true"
      )
        .children("Next"),
      Icon(h, "next")
    ),
    Button(h, {
      onPress: options.replay,
      props: {
        disabled: options.atStart,
        focusableWhenDisabled: true
      }
    }).class(secondary).attr("aria-label", "Back to the start")
      .children(
        Icon(h, "reset")
      )
  )

export const panel = [
  "flex min-w-0 flex-col rounded-lg border border-border bg-muted p-4",
  "diagram-medium:p-3"
].join(" ")
