/**
 * A panel that a button shows and hides, such as a section of settings or the
 * answer to a question.
 *
 * `Collapsible` is headless: it owns the panel's id, the ARIA, the data
 * attributes and the panel's size while it opens and closes, and the consumer
 * draws the markup. The consumer owns whether the panel is open, passes it as
 * `open`, and stores what the `Toggled` event reports.
 *
 * **Anatomy**
 *
 * | Part      | Element                                |
 * | :-------- | :------------------------------------- |
 * | `root`    | `<div>` around the trigger and the panel |
 * | `trigger` | `<button>` that opens and closes the panel |
 * | `panel`   | `<div>` with the content                 |
 *
 * Each part takes the consumer's builder and returns it with the part
 * applied, and the consumer adds the children:
 * `collapsible.panel(h.div)?.children("Content")`. The panel returns `undefined`
 * once it has closed, unless `keepMounted` or `hiddenUntilFound` is set. The
 * root is optional. A part's result is a builder, so it can also be another
 * kit call's `element`.
 *
 * **Data attributes**
 *
 * Each present with an empty value or absent:
 *
 * - `root` and `panel`: `data-open` / `data-closed`, `data-disabled`,
 *   `data-starting-style`, `data-ending-style`
 * - `trigger`: `data-panel-open`, `data-disabled`, `data-starting-style`,
 *   `data-ending-style`
 *
 * The panel also sets the CSS variables `--collapsible-panel-height` and
 * `--collapsible-panel-width`: the size of its content in px while it opens
 * and closes, and `auto` otherwise, so an open panel follows its content.
 * `data-starting-style` is present for the first frame after the panel opens,
 * and `data-ending-style` while it closes, so a transition can run from and to
 * a closed style: give the panel `height: var(--collapsible-panel-height)`,
 * `overflow: hidden` and a `transition` on `height`, and `height: 0` under
 * `[data-starting-style]` and `[data-ending-style]`.
 *
 * A keyframe animation works too, from or to `var(--collapsible-panel-height)`.
 * The panel stays in the page until its own transitions and animations finish,
 * then the collapsible emits `Settled`. One that loops doesn't count. For an
 * exit the kit can't see, set `holdExit` while it runs. A panel that is open on
 * the first render doesn't animate.
 *
 * **Keyboard**
 *
 * The trigger is a native button, so Enter and Space press it.
 *
 * **Find in page**
 *
 * With `hiddenUntilFound`, the closed panel stays in the page as
 * `hidden="until-found"`, so the browser's find-in-page searches it. A match
 * emits `Toggled` with the reason `"find-in-page"`, and the panel opens at once,
 * without its transition, when the consumer passes `open: true`. If it doesn't,
 * or the collapsible is disabled, the panel goes back to hidden. A browser
 * without `until-found` keeps the panel hidden, and find-in-page skips it. A
 * panel hidden until found isn't `display: none`, so a panel styled with its
 * own `display` needs `.panel[hidden]:not([hidden="until-found"]) { display: none }`
 * to hide when it is closed with `keepMounted`.
 *
 * **Example** (A section whose open state lives in the consumer's Model)
 *
 * ```ts import.meta.vitest
 * import { Component, UiSchema } from "@effect/ui"
 * import { Html, HtmlServer } from "@effect/ui/html"
 * import { Collapsible } from "@effect/ui-kit"
 * import { Effect, Schema } from "effect"
 *
 * const ShippingMessage = UiSchema.TaggedEnum({ ToggledDetails: { open: Schema.Boolean } })
 *
 * const Shipping = Component.define({
 *   name: "Shipping",
 *   scoped: false,
 *   model: Schema.Struct({ details: Schema.Boolean }),
 *   message: ShippingMessage,
 *   elements: Html
 * }).make({
 *   init: () => ({ details: true }),
 *   update: {
 *     ToggledDetails: (model, { open }) => ({ ...model, details: open })
 *   },
 *   view: (model, h) =>
 *     Collapsible(h, {
 *       props: { open: model.details },
 *       onEmit: {
 *         Toggled: ({ open }) => ShippingMessage.ToggledDetails({ open }),
 *         Settled: () => undefined
 *       },
 *       view: (collapsible) =>
 *         collapsible.root(h.div).children(
 *           collapsible.trigger(h.button.class("trigger")).children("Shipping details"),
 *           collapsible.panel(h.div.class("panel"))?.children("Standard shipping takes 3 to 5 days.")
 *         )
 *     })
 * })
 *
 * // The trigger points at the panel it opened.
 * const { html } = await Effect.runPromise(HtmlServer.renderToHtml(Shipping, {}))
 * const panel = /<div class="panel"[^>]* id="([^"]+)"/.exec(html)?.[1]
 * if (panel === undefined || !html.includes(`aria-controls="${panel}"`)) {
 *   throw new Error("the trigger doesn't point at the panel")
 * }
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Component from "@effect/ui/Component"
import * as Html from "@effect/ui/html/Html"
import * as Mount from "@effect/ui/Mount"
import * as UiSchema from "@effect/ui/UiSchema"
import * as View from "@effect/ui/View"
import * as Effect from "effect/Effect"
import * as Queue from "effect/Queue"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import { type Attributed, flag, idOf, withStyle } from "./internal/attributes.ts"
import { frameOf, type Phase, settling, transitionAttrs } from "./internal/transition.ts"

/**
 * Controls whether the panel is open and how it stays in the page while
 * closed.
 *
 * **Details**
 *
 * - `open`: whether the panel shows. Required: the consumer owns it.
 * - `disabled`: the trigger gets the native `disabled`, and neither a press
 *   nor a find-in-page match emits `Toggled`.
 * - `keepMounted`: the closed panel stays in the page, with `hidden`.
 * - `hiddenUntilFound`: the closed panel stays in the page as
 *   `hidden="until-found"`, so find-in-page can reveal it. It wins over
 *   `keepMounted`.
 * - `holdExit`: a closed panel stays in its ending state while this is `true`,
 *   for an exit animation that the consumer runs itself. Set it back to
 *   `false` once that animation ends, and the panel closes and the collapsible
 *   emits `Settled`.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const CollapsibleProps = Schema.Struct({
  open: Schema.Boolean,
  disabled: Schema.optional(Schema.Boolean),
  keepMounted: Schema.optional(Schema.Boolean),
  hiddenUntilFound: Schema.optional(Schema.Boolean),
  holdExit: Schema.optional(Schema.Boolean)
})

/**
 * The props of a `Collapsible`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type CollapsibleProps = typeof CollapsibleProps.Type

/**
 * Why a collapsible asks to open or close: a press on its trigger, or a
 * find-in-page match in its hidden panel.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const CollapsibleToggleReason = Schema.Literals(["trigger-press", "find-in-page"])

/**
 * Why a collapsible asks to open or close.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type CollapsibleToggleReason = typeof CollapsibleToggleReason.Type

/**
 * `Toggled` requests the value in `open`, with the reason. Store it and pass it
 * back as the `open` prop. `Settled` reports that the transitions and
 * animations of an open or a close finished.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const CollapsibleEvents = UiSchema.TaggedEnum({
  Toggled: { open: Schema.Boolean, reason: CollapsibleToggleReason },
  Settled: { open: Schema.Boolean }
})

/**
 * What a `Collapsible` emits.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type CollapsibleEvents = typeof CollapsibleEvents.Type

/**
 * Where a panel is in its open or close transition: `starting` for the first
 * frame after it opens, `ending` while it closes, and `null` otherwise.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type CollapsibleTransitionStatus = "starting" | "ending" | null

const Size = Schema.Struct({ height: Schema.Number, width: Schema.Number })

type Size = typeof Size.Type

const Message = UiSchema.TaggedEnum({
  ClickedTrigger: {},
  ShowedPanel: {},
  MeasuredPanel: { size: Size },
  RenderedFirstFrame: {},
  RenderedSize: {},
  FinishedTransition: { open: Schema.Boolean },
  MatchedFind: {},
  StayedHidden: {}
})

type Message = typeof Message.Type

const Model = Schema.Struct({
  mounted: Schema.Boolean,
  started: Schema.Boolean,
  ending: Schema.Boolean,
  size: Schema.NullOr(Size),
  instant: Schema.Boolean,
  openOnLoad: Schema.Boolean
})

type Model = typeof Model.Type

const statusOf = (model: Model, open: boolean): CollapsibleTransitionStatus =>
  open ? (model.started ? null : "starting") : model.mounted && model.ending ? "ending" : null

const px = (value: number | undefined): string => value === undefined ? "auto" : value + "px"

const panelStyle = (model: Model, open: boolean): string =>
  [
    "--collapsible-panel-height:" + px(model.size?.height),
    "--collapsible-panel-width:" + px(model.size?.width),
    ...(model.openOnLoad || (open && !model.started && model.size === null) ? ["animation-name:none"] : []),
    ...(model.instant ? ["transition-duration:0s", "animation-duration:0s"] : [])
  ].join(";")

const layoutStyles = ["justify-content", "align-items", "align-content", "justify-items"]

// A panel that aligns its content to the end, as a slide-down panel does,
// reports less than its content's size unless the alignment is reset.
const measure = (panel: HTMLElement): Size => {
  const saved = layoutStyles.map((name) => [name, panel.style.getPropertyValue(name)] as const)
  for (const name of layoutStyles) panel.style.setProperty(name, "initial", "important")
  const size = { height: panel.scrollHeight, width: panel.scrollWidth }
  for (const [name, value] of saved) {
    if (value === "") panel.style.removeProperty(name)
    else panel.style.setProperty(name, value)
  }
  return size
}

const TrackPanelArgs = {
  open: Schema.Boolean,
  mounted: Schema.Boolean,
  started: Schema.Boolean,
  ending: Schema.Boolean,
  holdExit: Schema.Boolean
}

type TrackPanelArgs = Schema.Struct<typeof TrackPanelArgs>["Type"]

const phaseOf = (args: TrackPanelArgs): Phase => ({
  open: args.open,
  mounted: args.mounted && args.ending,
  started: args.started,
  holdExit: args.holdExit
})

const TrackPanel = Mount.makeStream(
  "TrackPanel",
  { args: TrackPanelArgs },
  (node: HTMLElement, args, changes) =>
    Stream.callback<Message>((queue) => {
      const frame = frameOf(node.ownerDocument.defaultView)
      const twoFrames = (f: () => void) => frame(() => frame(f))
      let current: TrackPanelArgs = args
      const send = (message: Message) => Queue.offerUnsafe(queue, message)

      const opened = () => {
        send(Message.ShowedPanel())
        send(Message.MeasuredPanel({ size: measure(node) }))
        twoFrames(() => {
          if (current.open && !current.started) send(Message.RenderedFirstFrame())
        })
      }
      const closed = () => {
        send(Message.MeasuredPanel({ size: measure(node) }))
        twoFrames(() => {
          if (!current.open) send(Message.RenderedSize())
        })
      }

      // The browser removes `hidden` as it reveals a match, behind the renderer's
      // back, so the renderer won't put it back if the open never arrives. The
      // starting style comes off at once, or the match would measure zero-sized.
      let reveal: ReturnType<typeof setTimeout> | undefined
      const onBeforeMatch = () => {
        const starting = node.hasAttribute("data-starting-style")
        node.removeAttribute("data-starting-style")
        send(Message.MatchedFind())
        clearTimeout(reveal)
        reveal = setTimeout(() =>
          frame(() => {
            if (current.open || !node.isConnected) return
            if (starting) node.setAttribute("data-starting-style", "")
            node.setAttribute("hidden", "until-found")
            send(Message.StayedHidden())
          }), 0)
      }

      const transition = settling(node, () => node, frame, (open) => send(Message.FinishedTransition({ open })))
      const onChange = (next: TrackPanelArgs) => {
        const previous = current
        current = next
        if (!previous.open && next.open) opened()
        else if (previous.open && !next.open) closed()
        transition.follow(phaseOf(previous), phaseOf(next))
      }

      const controller = new AbortController()

      return Effect.acquireRelease(
        Effect.sync(() => {
          node.addEventListener("beforematch", onBeforeMatch, { signal: controller.signal })
          if (current.open && !current.started) opened()
        }).pipe(
          Effect.tap(() => Effect.forkScoped(Stream.runForEach(changes, (next) => Effect.sync(() => onChange(next)))))
        ),
        () =>
          Effect.sync(() => {
            controller.abort()
            clearTimeout(reveal)
            transition.cancel()
          })
      )
    })
)

/**
 * A headless collapsible. Call it with the consumer's `h` and a `view` closure
 * that draws the trigger with `collapsible.trigger` and the panel with
 * `collapsible.panel`, usually inside `collapsible.root`.
 *
 * **Details**
 *
 * The parts also return plain values for markup that depends on them: `open`,
 * `disabled`, `mounted` (the panel shows, through its exit transition) and
 * `transitionStatus`.
 *
 * Each part's attributes win over the ones the consumer set on the builder it
 * passes in, including the ones a state leaves absent: the data attributes on
 * every part; on the trigger `type`, `disabled`, `aria-disabled`, which it
 * removes, `aria-expanded` and `aria-controls`, which it sets only while the
 * panel is open; on the panel `hidden`. The panel keeps an `id` the consumer
 * gives it, and gets a generated one otherwise. The panel's CSS variables, and
 * the `animation-name` and durations it overrides to skip an animation, are
 * added after the consumer's inline style. A handler the consumer adds to a
 * part runs after the collapsible's own.
 *
 * On the server and on a host that doesn't run mounts, a panel that opens
 * stays at `data-starting-style`, and one that closes stays in the page.
 *
 * History restore saves nothing of it: after Back, forward or a reload it
 * starts from `init`.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const Collapsible = Component.define({
  name: "Collapsible",
  scoped: false,
  props: CollapsibleProps,
  model: Model,
  message: Message,
  events: CollapsibleEvents,
  restore: false,
  elements: Html
}).make({
  init: ($) => ({
    mounted: $.props.open,
    started: $.props.open,
    ending: false,
    size: null,
    instant: false,
    openOnLoad: $.props.open
  }),
  update: {
    ClickedTrigger: (model, _message, $) =>
      $.props.disabled === true
        ? model
        : $.emit(CollapsibleEvents.Toggled({ open: !$.props.open, reason: "trigger-press" })),
    ShowedPanel: (model, _message, $) =>
      $.props.open ? { ...model, mounted: true, ending: false } : model.mounted ? model : { ...model, mounted: true },
    MeasuredPanel: (model, { size }, $) =>
      $.props.open ? { ...model, size } : { ...model, size, ending: false, instant: false, openOnLoad: false },
    RenderedFirstFrame: (model, _message, $) => $.props.open && !model.started ? { ...model, started: true } : model,
    RenderedSize: (model, _message, $) => !$.props.open && model.mounted ? { ...model, ending: true } : model,
    FinishedTransition: (model, { open }, $) => {
      if (open !== $.props.open) return model
      if (open) return $.set({ ...model, size: null, instant: false }).emit(CollapsibleEvents.Settled({ open }))
      return model.mounted && model.ending && $.props.holdExit !== true
        ? $.set({ ...model, mounted: false, started: false, ending: false, size: null }).emit(
          CollapsibleEvents.Settled({ open })
        )
        : model
    },
    MatchedFind: (model, _message, $) =>
      $.props.open || $.props.disabled === true
        ? model
        : $.set({ ...model, started: true, instant: true }).emit(
          CollapsibleEvents.Toggled({ open: true, reason: "find-in-page" })
        ),
    StayedHidden: (model, _message, $) => $.props.open ? model : { ...model, started: false, instant: false }
  },
  parts: (model, p) => {
    const props = p.props
    const open = props.open
    const disabled = props.disabled === true
    const hiddenUntilFound = props.hiddenUntilFound === true
    const mounted = open || model.mounted
    const transitionStatus = statusOf(model, open)
    let panelId = p.id("panel")
    const states = <B extends Attributed<B>>(builder: B): B =>
      transitionAttrs(builder, open, transitionStatus).attr("data-disabled", flag(disabled))

    const root = p.part("div", (b) => states(b))

    const trigger = p.part("button", (b) =>
      b
        .attr("data-panel-open", flag(open))
        .attr("data-disabled", flag(disabled))
        .attr("data-starting-style", flag(transitionStatus === "starting"))
        .attr("data-ending-style", flag(transitionStatus === "ending"))
        .attr("type", "button")
        .attr("aria-expanded", open ? "true" : "false")
        .attr("aria-disabled", undefined)
        .disabled(disabled)
        .onClick(Message.ClickedTrigger())
        .forward((node) => node.attr("aria-controls", open ? panelId : undefined)))

    const panelPart = p.part("div", (b, id: string) =>
      states(b)
        .attr("id", id)
        .attr("hidden", mounted ? undefined : hiddenUntilFound ? "until-found" : "")
        .attr("data-starting-style", flag(transitionStatus === "starting" || (!mounted && hiddenUntilFound)))
        .forward((node) => {
          panelId = node.attrs.id ?? id
          return node.attr("style", withStyle(node.attrs.style, panelStyle(model, open)))
        })
        .onMount(
          TrackPanel({
            open,
            mounted: model.mounted,
            started: model.started,
            ending: model.ending,
            holdExit: props.holdExit === true
          })
        ))
    const panel = View.wrapPart(
      panelPart,
      <B extends View.PartTarget<"div">>(element: B): ReturnType<B["attr"]> | undefined => {
        panelId = idOf(element) ?? panelId
        const out = panelPart(element, panelId)
        return mounted || hiddenUntilFound || props.keepMounted === true ? out : undefined
      }
    )

    return { open, disabled, mounted, transitionStatus, root, trigger, panel }
  }
})
