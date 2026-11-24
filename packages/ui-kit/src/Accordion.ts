/**
 * A set of panels, each under a heading with a button that shows and hides
 * it, such as the questions of a FAQ.
 *
 * `Accordion` is headless and shares its state with the `AccordionItem`s in
 * its `view` closure. Each item is a headless `Collapsible` that reads which
 * values are open from the accordion and asks it to change them. The consumer
 * owns the values of the open items, passes them as `value`, and stores what
 * the accordion's `Toggled` event reports.
 *
 * **Anatomy**
 *
 * | Part              | Element                                          |
 * | :---------------- | :----------------------------------------------- |
 * | `accordion.root`  | `<div>` around the items                          |
 * | `item.root`       | `<div>` around an item's header and panel         |
 * | `item.header`     | `<h1>` to `<h6>` around the trigger                |
 * | `item.trigger`    | `<button>` that opens and closes the item's panel |
 * | `item.panel`      | `<div>` with the item's content                    |
 *
 * Each part takes the consumer's builder and returns it with the part
 * applied, and the consumer adds the children:
 * `item.panel(h.div)?.children("Content")`. The panel returns `undefined` once
 * it has closed, unless `keepMounted` or `hiddenUntilFound` is set. A part's
 * result is a builder, so it can also be another kit call's `element`.
 *
 * **Data attributes**
 *
 * Each present with an empty value or absent, unless it has a value:
 *
 * - `accordion.root`: `data-orientation`, `data-disabled`
 * - `item.root`, `item.header` and `item.panel`: `data-open` / `data-closed`,
 *   `data-disabled`, `data-orientation`, `data-index`
 * - `item.trigger`: `data-panel-open`, `data-disabled`, `data-orientation`,
 *   `data-index`
 * - `item.root`, `item.trigger` and `item.panel`: `data-starting-style` and
 *   `data-ending-style`
 *
 * `data-index` is the item's `index` prop, and absent without one.
 * `data-orientation` is the accordion's `orientation`, `vertical` by default.
 *
 * The panel sets the CSS variables `--accordion-panel-height` and
 * `--accordion-panel-width`: the size of its content in px while it opens and
 * closes, and `auto` otherwise. They equal `Collapsible`'s
 * `--collapsible-panel-height` and `--collapsible-panel-width`, which the panel
 * also has. To animate the panel, give it `height: var(--accordion-panel-height)`,
 * `overflow: hidden` and a `transition` on `height`, and `height: 0` under
 * `[data-starting-style]` and `[data-ending-style]`.
 *
 * **Keyboard**
 *
 * Each trigger is a native button, so Tab and Shift+Tab move between the
 * triggers, and Enter and Space press them. The arrow keys don't move between
 * triggers, following the ARIA Authoring Practices accordion pattern, which
 * dropped that roving focus.
 *
 * **Find in page**
 *
 * With `hiddenUntilFound`, a closed panel stays in the page as
 * `hidden="until-found"`, so the browser's find-in-page searches it. A match
 * emits `Toggled` with the reason `"find-in-page"` and the value that opens
 * its item, which in a single-item accordion closes the others.
 *
 * **Example** (A FAQ whose open question lives in the consumer's Model)
 *
 * ```ts import.meta.vitest
 * import { UiSchema } from "@effect/ui"
 * import { Html, HtmlServer } from "@effect/ui/html"
 * import { Accordion, AccordionItem } from "@effect/ui-kit"
 * import { Effect, Schema } from "effect"
 *
 * const questions = [
 *   { id: "shipping", question: "How long does shipping take?", answer: "3 to 5 days." },
 *   { id: "returns", question: "Can I return an item?", answer: "Within 30 days." }
 * ]
 *
 * const FaqMessage = UiSchema.TaggedEnum({ ToggledQuestions: { open: Schema.Array(Schema.String) } })
 *
 * const Faq = Html.component({
 *   name: "Faq",
 *   model: Schema.Struct({ open: Schema.Array(Schema.String) }),
 *   message: FaqMessage
 * }).make({
 *   init: () => ({ open: ["shipping"] }),
 *   update: {
 *     ToggledQuestions: ($, { open }) => ({ ...$.model, open })
 *   },
 *   view: (h, model) =>
 *     Accordion(h, {
 *       props: { value: model.open },
 *       onEmit: { Toggled: ({ value }) => FaqMessage.ToggledQuestions({ open: value }) },
 *       view: (accordion) =>
 *         accordion.root(h.div.class("faq")).children(
 *           questions.map((entry, index) =>
 *             AccordionItem(h, {
 *               key: entry.id,
 *               props: { value: entry.id, index },
 *               view: (item) =>
 *                 item.root(h.div).children(
 *                   item.header(h.h3).children(item.trigger(h.button).children(entry.question)),
 *                   item.panel(h.div.class("answer"))?.children(entry.answer)
 *                 )
 *             })
 *           )
 *         )
 *     })
 * })
 *
 * // The open answer is a region named by its question's button.
 * const { html } = await Effect.runPromise(HtmlServer.renderToHtml(Faq, {}))
 * const trigger = /<button[^>]* id="([^"]+)"/.exec(html)?.[1]
 * if (trigger === undefined || !/<div class="answer"[^>]* role="region"/.test(html) ||
 *   !html.includes(`aria-labelledby="${trigger}"`)) {
 *   throw new Error("the open answer isn't a region named by its trigger")
 * }
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Html from "@effect/ui/html/Html"
import * as UiSchema from "@effect/ui/UiSchema"
import * as View from "@effect/ui/View"
import * as Schema from "effect/Schema"
import {
  Collapsible,
  CollapsibleToggleReason,
  type CollapsibleTransitionStatus
} from "./Collapsible.ts"
import { type Attributed, flag, idOf, ownStyle } from "./internal/attributes.ts"
import { carries, find, layerOf, rewrite, setOn } from "./internal/tree.ts"

/**
 * The axis an accordion's items are laid out along.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const AccordionOrientation = Schema.Literals(["vertical", "horizontal"])

/**
 * The axis an accordion's items are laid out along.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type AccordionOrientation = typeof AccordionOrientation.Type

/**
 * Controls which items are open and how closed panels stay in the page.
 *
 * **Details**
 *
 * - `value`: the values of the open items. Required: the consumer owns it.
 * - `multiple`: lets several items be open at once. Off by default, so
 *   opening an item closes the others.
 * - `disabled`: disables every item.
 * - `keepMounted`: closed panels stay in the page, with `hidden`. An item's
 *   own `keepMounted` wins.
 * - `hiddenUntilFound`: closed panels stay in the page as
 *   `hidden="until-found"`, so find-in-page can reveal them. It wins over
 *   `keepMounted`. An item's own `hiddenUntilFound` wins.
 * - `orientation`: written as `data-orientation` on every part, for styling.
 *   `"vertical"` by default. It doesn't change the keyboard.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const AccordionProps = Schema.Struct({
  value: Schema.Array(Schema.String),
  multiple: Schema.optional(Schema.Boolean),
  disabled: Schema.optional(Schema.Boolean),
  keepMounted: Schema.optional(Schema.Boolean),
  hiddenUntilFound: Schema.optional(Schema.Boolean),
  orientation: Schema.optional(AccordionOrientation)
})

/**
 * The props of an `Accordion`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type AccordionProps = typeof AccordionProps.Type

/**
 * What an accordion emits.
 *
 * **Details**
 *
 * - `Toggled`: the accordion's value the user asked for, with the reason.
 *   Opening an item gives `[value]`, and closing it gives `[]`. With
 *   `multiple`, the item's value is added at the end or removed. Store it and
 *   pass it back as the `value` prop. A disabled accordion or item emits
 *   nothing.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const AccordionEvents = UiSchema.TaggedEnum({
  Toggled: {
    value: Schema.Array(Schema.String),
    reason: CollapsibleToggleReason
  }
})

/**
 * What an `Accordion` emits.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type AccordionEvents = typeof AccordionEvents.Type

const AccordionMessage = UiSchema.TaggedEnum({
  ToggledItem: {
    item: Schema.String,
    open: Schema.Boolean,
    reason: CollapsibleToggleReason
  }
})

const AccordionShared = Schema.Struct({
  value: Schema.Array(Schema.String),
  disabled: Schema.Boolean,
  keepMounted: Schema.Boolean,
  hiddenUntilFound: Schema.Boolean,
  orientation: AccordionOrientation
})

const toggled = (
  props: AccordionProps,
  item: string,
  open: boolean
): ReadonlyArray<string> => {
  if (!open) return props.value.filter((other) => other !== item)
  if (props.multiple !== true) return [item]
  return props.value.includes(item) ? props.value : [...props.value, item]
}

const resolved = (props: AccordionProps): typeof AccordionShared.Type => ({
  value: props.value,
  disabled: props.disabled === true,
  keepMounted: props.keepMounted === true,
  hiddenUntilFound: props.hiddenUntilFound === true,
  orientation: props.orientation ?? "vertical"
})

const numbered = <N extends View.Node<any, any>>(node: N): N => {
  let index = 0
  return rewrite(node, (child) => {
    if (
      child._tag !== "Child" || (child.component as unknown) !== AccordionItem
    ) return undefined
    const at = index++
    const props = child.props as AccordionItemProps
    return props.index === undefined
      ? { ...child, props: { ...props, index: at } }
      : child
  })
}

/**
 * A headless accordion. Call it with the consumer's `h`, the `props`, an
 * `onEmit` for `Toggled`, and a `view` closure that draws the root with
 * `accordion.root(h.div)` and, inside it, one `AccordionItem` for each item.
 *
 * **Details**
 *
 * The parts also return `value`, `disabled`, `multiple` and `orientation`,
 * resolved, for markup that depends on them.
 *
 * The root numbers the `AccordionItem`s it holds in the order it draws them,
 * and passes each its position as `index` unless the item has one. An item
 * the root can't see, such as one drawn by another component's view, keeps
 * the `index` its caller gives it.
 *
 * The root's `data-orientation` and `data-disabled` win over the consumer's,
 * including when `disabled` leaves the attribute absent. A part writes them
 * when it is applied, so an attribute the consumer chains after the part is
 * the consumer's to answer for.
 *
 * The accordion shares `{ value, disabled, keepMounted, hiddenUntilFound,
 * orientation }` with the components in its `view` closure, which is how an
 * `AccordionItem` inside reads it, and an item asks it to open or close
 * with a `ToggledItem` message.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const Accordion = Html.component({
  name: "Accordion",
  props: AccordionProps,
  model: Schema.Struct({}),
  message: AccordionMessage,
  events: AccordionEvents,
  shares: {
    value: (_model, props) => resolved(props),
    schema: AccordionShared,
    receives: ["ToggledItem"]
  }
}).make({
  init: () => ({}),
  update: {
    ToggledItem: ($, { item, open, reason }) =>
      $.props.disabled === true
        ? $.model
        : $.emit(
          AccordionEvents.Toggled({
            value: toggled($.props, item, open),
            reason
          })
        )
  },
  parts: (p) => {
    const { disabled, orientation, value } = resolved(p.props)
    return {
      value,
      disabled,
      multiple: p.props.multiple === true,
      orientation,
      root: p.part(
        "div",
        (b) =>
          b.attrs({
            "data-orientation": orientation,
            "data-disabled": flag(disabled)
          }).forward((node) => numbered(View.build(node, [])))
      )
    }
  }
})

/**
 * Controls one item of an accordion.
 *
 * **Details**
 *
 * - `value`: the item's value, which the accordion's `value` lists while the
 *   item is open. Required, and unique within its accordion.
 * - `index`: the item's position among the accordion's items, written as
 *   `data-index` on every part of the item. Left out, the accordion's root
 *   gives the item its position in the order the root draws its items, so a
 *   reordered list renumbers itself. Give it only for an item the root can't
 *   see, such as one drawn by another component's view.
 * - `disabled`: disables this item. A disabled accordion disables every item.
 * - `keepMounted` and `hiddenUntilFound`: as the accordion's, for this item's
 *   panel. Left out, the item follows the accordion.
 * - `holdExit`: a closed panel stays in its ending state while this is
 *   `true`, for an exit animation that the consumer runs itself. Set it back to
 *   `false` once that animation ends, and the panel closes and the item emits
 *   `Settled`.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const AccordionItemProps = Schema.Struct({
  value: Schema.String,
  index: Schema.optional(Schema.Number),
  disabled: Schema.optional(Schema.Boolean),
  keepMounted: Schema.optional(Schema.Boolean),
  hiddenUntilFound: Schema.optional(Schema.Boolean),
  holdExit: Schema.optional(Schema.Boolean)
})

/**
 * The props of an `AccordionItem`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type AccordionItemProps = typeof AccordionItemProps.Type

/**
 * What an accordion item emits.
 *
 * **Details**
 *
 * - `Toggled`: the user asked to open or close this item, with the reason.
 *   The accordion's `Toggled` carries the value to store, so an item's
 *   `onEmit` is optional.
 * - `Settled`: the transitions and animations of the panel's open or close
 *   finished.
 *
 * @stability experimental
 * @category schemas
 * @since 0.1.0
 */
export const AccordionItemEvents = UiSchema.TaggedEnum({
  Toggled: { open: Schema.Boolean, reason: CollapsibleToggleReason },
  Settled: { open: Schema.Boolean }
})

/**
 * What an `AccordionItem` emits.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type AccordionItemEvents = typeof AccordionItemEvents.Type

const AccordionItemMessage = UiSchema.TaggedEnum({
  ToggledCollapsible: { open: Schema.Boolean, reason: CollapsibleToggleReason },
  SettledCollapsible: { open: Schema.Boolean }
})

const headings = ["h1", "h2", "h3", "h4", "h5", "h6"] as const

/**
 * A headless item of an `Accordion`, built on `Collapsible`. Call it with the
 * consumer's `h`, a `key`, the `props`, and a `view` closure that draws the
 * root with `item.root(h.div)` and, inside it, the heading with
 * `item.header(h.h3)` around `item.trigger(h.button)`, and the panel with
 * `item.panel(h.div)`. It only renders inside an `Accordion`'s `view`
 * closure.
 *
 * **Details**
 *
 * The parts also return plain values for markup that depends on them:
 * `value`, `index`, `open`, `disabled`, `orientation`, `mounted` (the panel
 * shows, through its exit transition) and `transitionStatus`.
 *
 * Each part's attributes win over the ones the consumer set on the builder it
 * passes in, including the ones a state leaves absent: the data attributes on
 * every part; on the trigger `id`, `type`, `disabled`, `aria-disabled`,
 * which it removes, `aria-expanded` and `aria-controls`, which it sets only
 * while the panel is open; on the panel `role="region"`, `aria-labelledby`,
 * which names it by the trigger, and `hidden`. The item's root names the
 * panel by the trigger it holds, whichever of the two was built first, and
 * leaves `aria-labelledby` off when it holds no trigger. The trigger and the panel keep
 * an `id` the consumer gives them, and get a generated one otherwise. The
 * panel's CSS variables are added after the consumer's inline style. A
 * handler the consumer adds to a part runs after the item's own.
 *
 * On the server and on a host that doesn't run mounts, a panel that opens
 * stays at `data-starting-style`, and one that closes stays in the page.
 *
 * @stability experimental
 * @category components
 * @since 0.1.0
 */
export const AccordionItem = Html.component({
  name: "AccordionItem",
  props: AccordionItemProps,
  model: Schema.Struct({}),
  message: AccordionItemMessage,
  events: AccordionItemEvents,
  reads: { accordion: Accordion }
}).make({
  init: () => ({}),
  update: {
    ToggledCollapsible: ($, { open, reason }) =>
      $.props.disabled === true || $.reads.accordion.disabled
        ? $.model
        : $.send(Accordion, {
          _tag: "ToggledItem",
          item: $.props.value,
          open,
          reason
        }).emit(
          AccordionItemEvents.Toggled({ open, reason })
        ),
    SettledCollapsible: ($, { open }) =>
      $.emit(AccordionItemEvents.Settled({ open }))
  },
  parts: (p) => {
    const props = p.props
    const accordion = p.reads.accordion
    const open = accordion.value.includes(props.value)
    const disabled = props.disabled === true || accordion.disabled
    const orientation = accordion.orientation
    const index = props.index
    let triggerId: string | undefined
    const triggers = new Set<View.Owned>()
    const panels = new Set<View.Owned>()
    const states = <B extends Attributed<B>>(builder: B): B =>
      builder.attrs({
        "data-orientation": orientation,
        "data-index": index === undefined ? undefined : String(index)
      })

    const rootPart = p.part("div", (b) =>
      states(b).forward((node) => {
        if (panels.size === 0) return node
        const root = View.build(node, [])
        return setOn(
          root,
          panels,
          "aria-labelledby",
          find(root, (element) => carries(element, triggers))?.attrs.id
        )
      }))
    const header = p.part(headings, (b) =>
      states(b).attrs({
        "data-open": flag(open),
        "data-closed": flag(!open),
        "data-disabled": flag(disabled)
      }))
    const triggerPart = p.part("button", (b, id: string) =>
      states(b)
        .attr("id", id)
        .forward((node) => {
          triggerId = node.elementAttrs.id ?? id
          triggers.add(layerOf(node))
          return node
        }))
    const panelPart = p.part("div", (b) =>
      states(b)
        .attr("role", "region")
        .forward((node) => {
          panels.add(layerOf(node))
          return ownStyle(
            "--accordion-panel-height:var(--collapsible-panel-height);--accordion-panel-width:var(--collapsible-panel-width)"
          )(node.attr("aria-labelledby", triggerId))
        }))

    return p.child(Collapsible, {
      props: {
        open,
        disabled,
        keepMounted: props.keepMounted ?? accordion.keepMounted,
        hiddenUntilFound: props.hiddenUntilFound ?? accordion.hiddenUntilFound,
        holdExit: props.holdExit
      },
      onEmit: {
        Toggled: ({ open, reason }) =>
          AccordionItemMessage.ToggledCollapsible({ open, reason }),
        Settled: ({ open }) => AccordionItemMessage.SettledCollapsible({ open })
      },
      parts: (collapsible) => ({
        value: props.value,
        index,
        open,
        disabled,
        orientation,
        mounted: collapsible.mounted,
        transitionStatus: collapsible
          .transitionStatus as CollapsibleTransitionStatus,
        root: View.wrapPart(
          rootPart,
          <B extends View.PartTarget<"div">>(
            element: B
          ): ReturnType<B["attr"]> => rootPart(collapsible.root(element))
        ),
        header,
        trigger: View.wrapPart(
          triggerPart,
          <B extends View.PartTarget<"button">>(
            element: B
          ): ReturnType<B["attr"]> =>
            triggerPart(
              collapsible.trigger(element),
              idOf(element) ?? p.id("trigger")
            )
        ),
        panel: View.wrapPart(
          panelPart,
          <B extends View.PartTarget<"div">>(
            element: B
          ): ReturnType<B["attr"]> | undefined => {
            const out = collapsible.panel(element)
            return out === undefined ? undefined : panelPart(out)
          }
        )
      })
    })
  }
})
