import {
  Component,
  Mount,
  Renderer,
  Route,
  Router,
  type Subscription,
  UiSchema,
  View
} from "@effect/ui"
import {
  BrowserHost,
  Html,
  HtmlCommand,
  HtmlKeyboard,
  HtmlServer,
  HtmlSubscription
} from "@effect/ui/html"
import { HtmlLocator } from "@effect/ui/html/testing"
import { type Locator, Scene } from "@effect/ui/testing"
import { Context, Effect, type Layer, Schema, type Scope, Stream } from "effect"
import { describe, expect, it } from "tstyche"

const Msg = UiSchema.TaggedEnum({
  Typed: { value: Schema.String },
  Checked: { checked: Schema.Boolean },
  Sent: { title: Schema.String },
  Focused: { found: Schema.Boolean },
  Mounted: {}
})
type Msg = typeof Msg.Type

const Field = Html.ref("Field", "input")

class Clock
  extends Context.Service<Clock, { readonly now: Effect.Effect<number> }>()(
    "Clock"
  )
{}
class Logger extends Context.Service<
  Logger,
  { readonly log: (line: string) => Effect.Effect<void> }
>()("Logger") {}

const Tick = Mount.make(
  "Tick",
  { args: {} },
  () => Clock.use((clock) => clock.now)
)
const LogUp = Mount.make(
  "LogUp",
  { args: {} },
  () => Logger.use((logger) => logger.log("up")).pipe(Effect.as(Msg.Mounted()))
)
const Measure = Mount.make(
  "Measure",
  { args: {} },
  (node: HTMLElement) => Effect.sync(() => node.clientWidth)
)

const Ticker = Html.component({
  name: "Ticker",
  model: Schema.Number,
  message: Schema.Number
}).make({
  init: () => 0,
  update: (_, now) => now,
  view: (h, now) => h.time.onMount(Tick()).children(String(now))
})

interface NativeTags<Msg> {
  readonly view: View.ElementBuilder<Msg>
}
interface NativeHost {
  readonly NativeHost: unique symbol
}
interface Native extends View.Elements {
  readonly Tags: NativeTags<this["Msg"]>
  readonly Host: NativeHost
}

describe("Html", () => {
  it("Html.component supplies the HTML vocabulary and Html.H types reusable pure views", () => {
    const Button = <M>(h: Html.H<M>, message: M) => {
      expect(h.props).type.toBe<unknown>()
      return h.button.on("click", message).children("Save")
    }
    const Field = <M, C extends View.Children<M>>(h: Html.H<M>, options: {
      readonly label: string
      readonly children: C
    }) => h.label.children(options.label, h.div.children(options.children))
    const SaveButton = Html.component({
      name: "SaveButton",
      props: Schema.Struct({ id: Schema.String }),
      model: Schema.Number,
      message: Schema.Literal("Save")
    }).make({
      init: () => 0,
      update: ($) => $.model,
      view: (h) => {
        expect(Button<"Save">).type.not.toBeCallableWith(h, "Delete")
        const clock = {} as View.Node<"Save", Clock>
        const logger = {} as View.Node<"Save", Logger>
        return Field(h, {
          label: h.props.id,
          children: [Button(h, "Save"), clock, logger]
        })
      }
    })
    expect(SaveButton).type.toBe<
      Component.Component<
        "SaveButton",
        { readonly id: string },
        number,
        "Save",
        never,
        Clock | Logger,
        Html.Elements
      >
    >()
  })

  it("the module is a vocabulary", () => {
    expect(Html).type.toBeAssignableTo<View.Vocabulary<Html.Elements>>()
    Component.define({
      name: "Tags",
      model: Schema.String,
      message: Msg,
      elements: Html
    }).make({
      init: () => "",
      update: ($) => $.model,
      view: (h) => {
        expect(h.div(h.span("text"), "more")).type.toBe<
          Html.Element<Msg, never, Html.EventsOf<"div">, HTMLDivElement, "div">
        >()
        expect(h.div.class("box")).type.toBe<
          Html.Element<Msg, never, Html.EventsOf<"div">, HTMLDivElement, "div">
        >()
        expect(h.input).type.toBe<
          Html.VoidElement<
            Msg,
            never,
            Html.EventsOf<"input">,
            HTMLInputElement,
            "input"
          >
        >()
        expect(h.slot("Untitled")).type.toBe<
          Html.Element<
            Msg,
            never,
            Html.EventsOf<"slot">,
            HTMLSlotElement,
            "slot"
          >
        >()
        expect(h).type.not.toHaveProperty("script")
        return h.div()
      }
    })
  })

  it("children returns the builder, so more children and attributes can follow", () => {
    Html.component({
      name: "Order",
      model: Schema.String,
      message: Msg
    }).make({
      init: () => "",
      update: ($) => $.model,
      view: (h, draft) => {
        const form = h.form.on("submit", Msg.Sent({ title: draft })).children(
          h.input.ref(Field).value(draft).on(
            "input",
            ({ value }) => Msg.Typed({ value })
          ),
          h.button.attr("type", "submit").children("Add"),
          h.span(draft),
          h.br
        )
        expect(form).type.toBe<
          Html.Element<
            Msg,
            never,
            Html.EventsOf<"form">,
            HTMLFormElement,
            "form"
          >
        >()
        // The shorthand and `children` both return the builder, with the children's requirements.
        const needsClock = {} as View.Node<Msg, Clock>
        expect(h.div("a").class("box").children(needsClock)).type.toBe<
          Html.Element<Msg, Clock, Html.EventsOf<"div">, HTMLDivElement, "div">
        >()
        // It is content, not a node: nothing reads its children off it.
        expect(h.div.children("a")).type.toBeAssignableTo<
          View.Content<Msg, never>
        >()
        expect(h.div.children("a")).type.not.toHaveProperty("_tag")
        // A chained builder isn't callable: only the root is shorthand.
        expect(h.div).type.toBeCallableWith("a")
        expect(h.div("a")).type.not.toBeAssignableTo<
          (...args: never) => unknown
        >()
        expect(h.div.class("box")).type.not.toBeAssignableTo<
          (...args: never) => unknown
        >()
        expect(h.div.class("box").children).type.toBeCallableWith(
          "a",
          h.br,
          [h.span("b")],
          false,
          null,
          undefined
        )
        // Void tags take no children and aren't callable.
        expect(h.input).type.not.toHaveProperty("children")
        expect(h.input.value(draft)).type.not.toHaveProperty("children")
        expect(h.br).type.not.toBeAssignableTo<(...args: never) => unknown>()
        expect(h.input).type.not.toBeAssignableTo<(...args: never) => unknown>()
        // A builder is a valid child and a valid view without a terminal call.
        expect(h.ul.children).type.toBeCallableWith(h.li, h.li.key("a"))
        return h.div.class("root")
      }
    })
  })

  it("forward returns the builder's own class, with what it adds in the requirements", () => {
    Html.component({
      name: "Forward",
      model: Schema.String,
      message: Msg
    }).make({
      init: () => "",
      update: ($) => $.model,
      view: (h) => {
        const needsClock = {} as View.Node<Msg, Clock>
        const framed = h.button.forward((node) => {
          expect(node).type.toBe<
            Html.Element<
              Msg,
              never,
              Html.EventsOf<"button">,
              HTMLButtonElement,
              "button"
            >
          >()
          return h.div.class("frame").children(node, needsClock)
        })
        expect(framed).type.toBe<
          Html.Element<
            Msg,
            Clock,
            Html.EventsOf<"button">,
            HTMLButtonElement,
            "button"
          >
        >()
        expect(
          framed.attr("title", "Go").attrs({
            id: "go",
            "aria-label": undefined
          }).children("Go")
        ).type.toBe<
          Html.Element<
            Msg,
            Clock,
            Html.EventsOf<"button">,
            HTMLButtonElement,
            "button"
          >
        >()
        // A void element keeps its class, and still takes no children.
        const input = h.input.forward((node) =>
          h.label.children("Amount", node)
        )
        expect(input.value("1")).type.toBe<
          Html.VoidElement<
            Msg,
            never,
            Html.EventsOf<"input">,
            HTMLInputElement,
            "input"
          >
        >()
        expect(input).type.not.toHaveProperty("children")
        // The function returns an element: not text, and not a component's child.
        expect(h.button.forward).type.not.toBeCallableWith(() => "Go")
        expect(h.button.forward).type.not.toBeCallableWith(() =>
          ({}) as View.Child<Msg, never>
        )
        return framed
      }
    })
  })

  it("a builder chosen by a condition keeps the requirements of its children and mount", () => {
    Html.component({
      name: "Either",
      model: Schema.Boolean,
      message: Msg
    }).make({
      init: () => false,
      update: ($) => $.model,
      view: (h, inline) => {
        type Either<R> =
          | Html.Element<Msg, R, Html.EventsOf<"div">, HTMLDivElement, "div">
          | Html.Element<Msg, R, Html.EventsOf<"span">, HTMLSpanElement, "span">
        const needsClock = {} as View.Node<Msg, Clock>
        const root = inline ? h.span : h.div
        expect(
          root.attr("id", "x").onMount(LogUp()).children(needsClock)
        ).type.toBe<Either<Logger | Clock>>()
        // @ts-expect-error This expression is not callable
        root(needsClock)
        return root
      }
    })
  })

  it("only a builder whose children returns its builder is a shorthand", () => {
    const built = {} as View.ElementBuilder<Msg> & {
      readonly children: (...inputs: Array<View.Input<Msg>>) => View.Node<Msg>
    }
    expect(View.shorthand).type.not.toBeCallableWith(built)
  })

  it("errors point at the offending child", () => {
    Html.component({
      name: "Errors",
      model: Schema.String,
      message: Msg
    }).make({
      init: () => "",
      update: ($) => $.model,
      view: (h) => {
        expect(h.div).type.not.toBeCallableWith(h.span("ok"), 1)
        expect(h.div.class("x").children).type.not.toBeCallableWith(
          h.span("ok"),
          { _tag: "Element" }
        )
        return h.div()
      }
    })
  })

  it("events carry the tag's payloads", () => {
    Html.component({
      name: "Events",
      model: Schema.String,
      message: Msg
    }).make({
      init: () => "",
      update: ($) => $.model,
      view: (h) => {
        expect(h.input.on).type.toBeCallableWith(
          "input",
          ({ checked }: Html.InputPayload) => Msg.Checked({ checked })
        )
        expect(h.textarea.on).type.toBeCallableWith(
          "input",
          ({ value }: Html.ValuePayload) => Msg.Typed({ value })
        )
        expect(h.form.on).type.toBeCallableWith("submit", (
          { fields }: Html.SubmitPayload
        ) => Msg.Sent({ title: fields.title ?? "" }))
        expect(h.button.on).type.toBeCallableWith("click", (
          { shift }: Html.PointerPayload
        ) => shift ? undefined : Msg.Mounted())
        expect(h.input.on).type.toBeCallableWith(
          "compositionend",
          ({ value }: Html.CompositionPayload) => Msg.Typed({ value })
        )
        expect(h.textarea.on).type.toBeCallableWith(
          "compositionend",
          ({ value }: Html.CompositionPayload) => Msg.Typed({ value })
        )
        expect(h.input.on).type.toBeCallableWith(
          "input",
          ({ composing, inputType, value }: Html.InputPayload) =>
            composing || inputType === "insertReplacementText"
              ? undefined
              : Msg.Typed({ value })
        )
        expect(h.input.on).type.toBeCallableWith(
          "keydown",
          ({ selectionEnd, selectionStart }: Html.KeyPayload) =>
            selectionStart === selectionEnd ? undefined : Msg.Mounted()
        )
        expect<Html.KeyPayload["selectionStart"]>().type.toBe<number | null>()
        expect<Html.KeyPayload["repeat"]>().type.toBe<boolean>()
        expect<Html.KeyPayload["editable"]>().type.toBe<boolean>()
        const shortcutHandler = HtmlKeyboard.shortcuts([
          { key: "?", message: Msg.Typed({ value: "help" }) },
          { key: "Escape", message: Msg.Mounted(), whileTyping: true }
        ])
        expect<ReturnType<typeof shortcutHandler>>().type.toBe<
          | ReturnType<typeof Msg.Typed>
          | ReturnType<typeof Msg.Mounted>
          | undefined
        >()
        expect(h.div.on).type.toBeCallableWith("keydown", shortcutHandler)
        HtmlSubscription.onDocument("keydown", shortcutHandler, {
          preventDefault: true
        })
        const shortcutSub = HtmlSubscription.shortcuts([
          { key: "?", message: Msg.Typed({ value: "help" }) },
          { key: "Escape", message: Msg.Mounted(), whileTyping: true }
        ])
        expect(shortcutSub).type.toBe<
          Subscription.Subscription<
            ReturnType<typeof Msg.Typed> | ReturnType<typeof Msg.Mounted>
          >
        >()
        expect(h.input.on).type.toBeCallableWith(
          "paste",
          ({ text }: Html.PastePayload) => Msg.Typed({ value: text }),
          { preventDefault: true }
        )
        expect(h.div.on).type.toBeCallableWith(
          "paste",
          ({ text }: Html.PastePayload) => Msg.Typed({ value: text })
        )
        h.slot.on("slotchange", (payload) => {
          expect(payload).type.toBe<{}>()
          return Msg.Mounted()
        })
        expect(h.div.on).type.not.toBeCallableWith("slotchange", Msg.Mounted())
        expect(h.div.on).type.not.toBeCallableWith("input", Msg.Mounted())
        expect(h.div.on).type.not.toBeCallableWith("submit", Msg.Mounted())
        expect(h.select.on).type.not.toBeCallableWith(
          "compositionend",
          Msg.Mounted()
        )
        expect(h.div.on).type.not.toBeCallableWith(
          "compositionend",
          Msg.Mounted()
        )
        expect(h.button.on).type.not.toBeCallableWith("click", "not a message")
        return h.div()
      }
    })
  })

  it("pointer gestures carry the pointer's id, and only a press can capture it", () => {
    Html.component({
      name: "Gestures",
      model: Schema.String,
      message: Msg
    }).make({
      init: () => "",
      update: ($) => $.model,
      view: (h) => {
        const handler = ({ pointerId }: Html.PointerPayload) =>
          pointerId === -1 ? undefined : Msg.Mounted()
        expect(h.div.on).type.toBeCallableWith("pointermove", handler)
        expect(h.div.on).type.toBeCallableWith("pointerup", handler)
        expect(h.div.on).type.toBeCallableWith("pointercancel", handler)
        expect(h.div.on).type.toBeCallableWith("pointerdown", handler, {
          capturePointer: true
        })
        expect(h.circle.on).type.toBeCallableWith("pointermove", handler)
        expect(h.circle.on).type.toBeCallableWith("pointerup", handler)
        expect(h.circle.on).type.toBeCallableWith("pointercancel", handler)
        expect(h.circle.on).type.toBeCallableWith("pointerdown", handler, {
          capturePointer: true
        })
        expect<Html.PointerPayload["pointerId"]>().type.toBe<number>()
        expect(h.div.on).type.not.toBeCallableWith("pointermove", handler, {
          capturePointer: true
        })
        expect(h.circle.on).type.not.toBeCallableWith("click", handler, {
          capturePointer: true
        })
        return h.div()
      }
    })
  })

  it("controlled properties exist on the elements that have them", () => {
    Html.component({
      name: "Controlled",
      model: Schema.String,
      message: Msg
    }).make({
      init: () => "",
      update: ($) => $.model,
      view: (h) => {
        expect(h.input.value).type.toBeCallableWith("text")
        expect(h.select.value).type.toBeCallableWith("a")
        expect(h.input.checked).type.toBeCallableWith(true)
        expect(h.option.selected).type.toBeCallableWith(true)
        expect(h.details.open).type.toBeCallableWith(true)
        expect(h.div.value).type.not.toBeCallableWith("text")
        expect(h.select.checked).type.not.toBeCallableWith(true)
        expect(h.input.open).type.not.toBeCallableWith(true)
        // A dialog is also modal; `open` stays boolean, and nothing else is modal.
        expect(h.dialog.modal).type.toBeCallableWith(true)
        expect(h.dialog.open).type.not.toBeCallableWith("modal")
        expect(h.details.modal).type.not.toBeCallableWith(true)
        expect(h.div.modal).type.not.toBeCallableWith(true)
        // Any element can be a popover, manual or auto; its toggle carries both states.
        expect(h.div.popover).type.toBeCallableWith("manual", true)
        expect(h.button.popover).type.toBeCallableWith("auto", false)
        expect(h.div.popover).type.not.toBeCallableWith("hint", true)
        expect(h.div.on).type.toBeCallableWith(
          "toggle",
          ({ newState, oldState, open }: Html.PopoverTogglePayload) =>
            Msg.Typed({ value: `${oldState}${newState}${open}` })
        )
        return h.div()
      }
    })
  })

  it("SVG tags have named builders with checked attributes", () => {
    expect(Html.ref("Icon", "svg")).type.toBe<Renderer.Ref<SVGSVGElement>>()
    Html.component({
      name: "Icon",
      model: Schema.String,
      message: Msg
    }).make({
      init: () => "",
      update: ($) => $.model,
      view: (h) => {
        const icon = h.svg
          .class("icon")
          .style({ width: "1em" })
          .id("arrow")
          .attrs({ viewBox: "0 0 24 24", "stroke-width": "2" })
          .on("click", Msg.Mounted())
          .children(
            h.path.attr("d", "M5 12h14"),
            h.circle.attrs({ cx: "12", cy: "12", r: "10" }),
            h.svgText("label")
          )
        expect(icon).type.toBe<
          Html.SvgElement<Msg, never, SVGSVGElement, "svg">
        >()
        // `h.text` stays the text-node helper; the element is `h.svgText`.
        expect(h.text("label")).type.toBe<View.Text>()
        expect(h.path.attr).type.not.toBeCallableWith("strok-width", "2")
        // A client `setAttribute` can't put `xlink:href` in its namespace.
        expect(h.use.attr).type.not.toBeCallableWith("xlink:href", "#shape")
        expect(h.use.attr).type.toBeCallableWith("href", "#shape")
        expect(h.circle.attrs).type.not.toBeCallableWith({ d: "M0 0" })
        expect(h.svg).type.not.toHaveProperty("disabled")
        return h.div(icon)
      }
    })
  })

  it("refs and onMount are typed by tag", () => {
    expect(Field).type.toBe<Renderer.Ref<HTMLInputElement>>()
    const Focus = Mount.make(
      "Focus",
      { args: {} },
      (element: HTMLInputElement) => {
        expect(element).type.toBe<HTMLInputElement>()
        return Effect.succeed(Msg.Mounted())
      }
    )
    Html.component({
      name: "Refs",
      model: Schema.String,
      message: Msg
    }).make({
      init: () => "",
      update: ($) => $.model,
      view: (h) => {
        expect(h.input.ref).type.toBeCallableWith(Field)
        expect(h.input.value("a").ref).type.toBeCallableWith(Field)
        expect(h.textarea.ref).type.not.toBeCallableWith(Field)
        expect(h.textarea.attr("rows", "2").ref).type.not.toBeCallableWith(
          Field
        )
        // A mount goes on an element whose node its body can take.
        expect(h.textarea.onMount).type.not.toBeCallableWith(Focus())
        expect(h.input.onMount).type.toBeCallableWith(
          Measure().pipe(Mount.map(() => Msg.Mounted()))
        )
        return h.input.onMount(Focus())
      }
    })
  })

  it("requirements from onMount and from children reach the component", () => {
    const Mounted = Html.component({
      name: "Mounted",
      model: Schema.Null,
      message: Msg
    }).make({
      init: () => null,
      update: ($) => $.model,
      view: (h) =>
        h.div.onMount(LogUp())
          .class("box")
          .children(Ticker(h, { key: "ticker" }))
    })
    expect(Mounted).type.toBe<
      Component.Component<
        "Mounted",
        {},
        null,
        Msg,
        never,
        Logger | Clock,
        Html.Elements
      >
    >()
    const Shorthand = Html.component({
      name: "Shorthand",
      model: Schema.Null,
      message: Msg
    }).make({
      init: () => null,
      update: ($) => $.model,
      view: (h) => h.section(h.p("clock"), [Ticker(h, { key: "ticker" })])
    })
    expect(Shorthand).type.toBe<
      Component.Component<
        "Shorthand",
        {},
        null,
        Msg,
        never,
        Clock,
        Html.Elements
      >
    >()
    const Bare = Html.component({
      name: "Bare",
      model: Schema.Null,
      message: Msg
    }).make({
      init: () => null,
      update: ($) => $.model,
      view: (h) => h.input.onMount(LogUp())
    })
    expect(Bare).type.toBe<
      Component.Component<"Bare", {}, null, Msg, never, Logger, Html.Elements>
    >()
  })

  it("a mount may end with Component.noop, and its body gets its args and a typed Stream of them", () => {
    const Hello = Mount.make(
      "Hello",
      { args: {} },
      () => Effect.succeed(Component.noop)
    )
    const DrawChart = Mount.make(
      "DrawChart",
      { args: { points: Schema.Array(Schema.Number) } },
      (node: HTMLCanvasElement, args, changes) => {
        expect(node).type.toBe<HTMLCanvasElement>()
        expect(args).type.toBe<{ readonly points: ReadonlyArray<number> }>()
        expect(changes).type.toBe<
          Stream.Stream<{ readonly points: ReadonlyArray<number> }>
        >()
        return Stream.runForEach(
          changes,
          () => Logger.use((logger) => logger.log("draw"))
        ).pipe(
          Effect.as(Component.noop)
        )
      }
    )
    expect(DrawChart).type.not.toBeCallableWith()
    expect(DrawChart).type.not.toBeCallableWith({ points: "none" })
    const Chart = Html.component({
      name: "Chart",
      model: Schema.Array(Schema.Number),
      message: Schema.Never
    }).make({
      init: (): ReadonlyArray<number> => [],
      update: ($) => $.model,
      view: (h, points) =>
        h.div.onMount(Hello()).children(h.canvas.onMount(DrawChart({ points })))
    })
    expect(Chart).type.toBe<
      Component.Component<
        "Chart",
        {},
        ReadonlyArray<number>,
        never,
        never,
        Logger,
        Html.Elements
      >
    >()
    const div = new Html.Element<
      Msg,
      never,
      Record<string, unknown>,
      HTMLDivElement
    >("div")
    // A result that isn't the component's message is mapped to one first.
    expect(div.onMount).type.not.toBeCallableWith(Measure())
    expect(div.onMount).type.toBeCallableWith(
      Measure().pipe(Mount.map(() => Msg.Mounted()))
    )
    // A scene's step takes the definition's own result, and none for a mount that ends with noop.
    const scene = Scene.start(Chart, {})
    expect(scene.mounted).type.toBeCallableWith(Measure, 300)
    expect(scene.mounted).type.not.toBeCallableWith(Measure, "wide")
    expect(scene.mounted).type.not.toBeCallableWith(Measure)
    expect(scene.mounted).type.toBeCallableWith(Hello)
    expect(scene.mounted).type.toBeCallableWith(DrawChart({ points: [] }))
  })

  it("onMount ends with a message or Component.noop, never with void or undefined", () => {
    const div = new Html.Element<Msg>("div")
    const input = new Html.VoidElement<Msg>("input")
    const Silent = Mount.make(
      "Silent",
      { args: {} },
      () => Effect.succeed(Component.noop)
    )
    const Mixed = Mount.make(
      "Mixed",
      { args: {} },
      () =>
        Effect.gen(function*() {
          const ok = yield* Effect.succeed(true)
          return ok ? Msg.Mounted() : Component.noop
        })
    )
    expect(div.onMount).type.toBeCallableWith(Silent())
    expect(div.onMount).type.toBeCallableWith(Mixed())
    expect(input.onMount).type.toBeCallableWith(Silent())

    const holdsAValue: Effect.Effect<void> = Effect.succeed("not a message")
    const Void = Mount.make("Void", { args: {} }, () => Effect.void)
    const Holds = Mount.make("Holds", { args: {} }, () => holdsAValue)
    const Undefined = Mount.make(
      "Undefined",
      { args: {} },
      () => Effect.succeed(undefined)
    )
    const Other = Mount.make(
      "Other",
      { args: {} },
      () => Effect.succeed(Symbol.for("other"))
    )
    for (const builder of [div, input]) {
      expect(builder.onMount).type.not.toBeCallableWith(Void())
      expect(builder.onMount).type.not.toBeCallableWith(Holds())
      expect(builder.onMount).type.not.toBeCallableWith(Undefined())
      expect(builder.onMount).type.not.toBeCallableWith(Other())
    }
  })

  it("a rejected onMount result shows View.MountHint", () => {
    const div = new Html.Element<Msg>("div")
    const input = new Html.VoidElement<Msg>("input")
    const Void = Mount.make("Void", { args: {} }, () => Effect.void)
    // @ts-expect-error or end its body with Effect.as(Component.noop)
    div.onMount(Void())
    // @ts-expect-error or end its body with Effect.as(Component.noop)
    input.onMount(Void())
    new Html.Element<Msg, never, Record<string, unknown>, HTMLDivElement>("div")
      // @ts-expect-error Map its result with Mount.map
      .onMount(Measure())
  })

  it("View.Input keeps what a child requires", () => {
    const PageDef = Html.component({
      name: "Page",
      model: Schema.Null,
      message: Msg
    })
    const ticker = {} as View.Node<Msg, Clock>
    const plain = (..._children: ReadonlyArray<View.Input<Msg>>) => {}
    expect(plain).type.toBeCallableWith("text", null)
    expect(plain).type.not.toBeCallableWith(ticker)
    const card = <const C extends ReadonlyArray<View.Input<Msg, any>>>(
      h: Component.Helper<typeof PageDef>,
      ...children: C
    ) => h.section(...children)
    const Page = PageDef.make({
      init: () => null,
      update: ($) => $.model,
      view: (h) => card(h, h.h1("Title"), ticker)
    })
    expect(Page).type.toBe<
      Component.Component<"Page", {}, null, Msg, never, Clock, Html.Elements>
    >()
    expect<View.Requirements<any>>().type.toBe<any>()
  })

  it("style accepts typed CSS properties and preserves the element type", () => {
    const div = new Html.Element<
      Msg,
      Clock,
      Html.EventsOf<"div">,
      HTMLDivElement,
      "div"
    >("div")
    const input = new Html.VoidElement<
      Msg,
      Logger,
      Html.EventsOf<"input">,
      HTMLInputElement,
      "input"
    >("input")
    expect(div.style({ color: "red", marginTop: "1rem", "--accent": "#09f" }))
      .type.toBe<typeof div>()
    expect(input.style({ color: false, width: null, height: undefined })).type
      .toBe<typeof input>()
    expect(div.style).type.not.toBeCallableWith(1)
    expect(div.style).type.not.toBeCallableWith("color:red")
    expect(div.style).type.not.toBeCallableWith({ width: 10 })
    expect(div.style).type.not.toBeCallableWith({ color: true })
    expect(div.style).type.not.toBeCallableWith({ unknownProperty: "red" })
    expect(div.style).type.not.toBeCallableWith({ cssText: "color:red" })
    expect(div.style).type.not.toBeCallableWith({ cssFloat: "left" })
    expect(div.style).type.not.toBeCallableWith({ length: "1" })
    expect(div.style).type.not.toBeCallableWith({ setProperty: "red" })
    expect<Html.StyleValue>().type.toBe<string | false | null | undefined>()
  })

  it("class takes string tokens and rejects true and numbers", () => {
    const button = new Html.Element<Msg>("button")
    const saving = false as boolean
    const count = 0 as number
    expect(button.class("rounded", saving && "opacity-50", null, undefined))
      .type.toBe<Html.Element<Msg>>()
    expect(button.class).type.not.toBeCallableWith("rounded", true)
    expect(button.class).type.not.toBeCallableWith("rounded", 1)
    expect(button.class).type.not.toBeCallableWith(saving || "opacity-50")
    expect(button.class).type.not.toBeCallableWith(count && "badge")
    expect(Html.classNames).type.not.toBeCallableWith("rounded", true)
    expect(Html.classNames).type.not.toBeCallableWith("rounded", 1)
    expect(Html.classNames("rounded", saving && "opacity-50")).type.toBe<
      string
    >()
  })

  it("ref Commands add nothing to a component's requirements", () => {
    const Form = Html.component({
      name: "Form",
      model: Schema.String,
      message: Msg
    }).make({
      init: () => "",
      update: ($) =>
        $.run(HtmlCommand.focus(Field, ({ found }) => Msg.Focused({ found }))),
      view: (h) => h.input.ref(Field)
    })
    expect(Form).type.toBe<
      Component.Component<"Form", {}, string, Msg, never, never, Html.Elements>
    >()
  })
})

describe("HtmlLocator", () => {
  it("structural queries return a structural node, which compares with any node in the tree", () => {
    const tree = {
      tag: "form",
      children: [
        {
          tag: "label",
          attrs: { for: "new" },
          children: [{ text: "New todo" }]
        },
        { tag: "input", attrs: { id: "new" } }
      ]
    }
    expect(HtmlLocator.getByRole(tree, "textbox")).type.toBe<Locator.Node>()
    expect(HtmlLocator.queryAllByRole(tree, "textbox")).type.toBe<
      ReadonlyArray<Locator.Node>
    >()
    expect(HtmlLocator.getByRole(tree, "textbox") === tree.children[1]).type
      .toBe<boolean>()
    expect(HtmlLocator.nameOf(tree, tree.children[1]!)).type.toBe<string>()
    expect(HtmlLocator.value(tree.children[1])).type.toBe<string | undefined>()
    expect(HtmlLocator.checked(tree.children[1])).type.toBe<
      boolean | undefined
    >()
  })

  it("DOM queries return elements", () => {
    expect(HtmlLocator.getByRole(document, "button")).type.toBe<HTMLElement>()
    expect(HtmlLocator.queryAllByRole(document.body, "button")).type.toBe<
      ReadonlyArray<HTMLElement>
    >()
  })
})

describe("BrowserHost", () => {
  const Counter = Html.component({
    name: "Counter",
    model: Schema.Number,
    message: Msg
  }).make({
    init: () => 0,
    update: ($) => $.model + 1,
    view: (h, count) =>
      h.button.on("click", Msg.Mounted()).children(String(count))
  })

  it("mountEffect needs only a Scope for an HTML root", () => {
    expect(BrowserHost.mountEffect(Counter, {}, document.body)).type.toBe<
      Effect.Effect<Renderer.Root<number, Msg>, never, Scope.Scope>
    >()
  })

  it("mount is a Layer that needs nothing for an HTML root", () => {
    expect(BrowserHost.mount(Counter, {}, document.body)).type.toBe<
      Layer.Layer<never>
    >()
  })

  it("mount and renderToHtml with Router.props need the Router", () => {
    const AppRoute = Route.union({
      Home: Route.make("/"),
      NotFound: Route.make("/*")
    })
    const App = Html.component({
      name: "App",
      props: Schema.Struct({ route: AppRoute }),
      model: AppRoute,
      message: Schema.Never
    }).make({
      init: ($) => $.props.route,
      update: ($) => $.model,
      view: (h, route) => h.h1(route._tag)
    })
    expect(BrowserHost.mount(App, Router.props(AppRoute), document.body)).type
      .toBe<
        Layer.Layer<never, never, Router.Router>
      >()
    expect(HtmlServer.renderToHtml(App, Router.props(AppRoute))).type.toBe<
      Effect.Effect<
        HtmlServer.Rendered<typeof AppRoute.Type>,
        never,
        Router.Router
      >
    >()
  })

  it("Renderer.mount of an HTML root needs Html.Host", () => {
    expect(Renderer.mount(Counter, {}, document.body)).type.toBe<
      Effect.Effect<
        Renderer.Root<number, Msg>,
        never,
        Html.Host | Renderer.Renderer | Scope.Scope
      >
    >()
  })

  it("onEmit is typed by the root's events, and named options without it still fit an emitting root", () => {
    const Events = UiSchema.TaggedEnum({ Finished: { answer: Schema.Number } })
    const Picker = Html.component({
      name: "Picker",
      model: Schema.Number,
      message: Msg,
      events: Events
    }).make({
      init: () => 0,
      update: ($) => $.model,
      view: (h) => h.button("pick")
    })
    BrowserHost.mountEffect(Picker, {}, document.body, {
      onEmit: (event) => {
        expect(event).type.toBe<typeof Events.Type>()
      }
    })
    const options: BrowserHost.MountOptions<Html.Elements> = { head: false }
    expect(BrowserHost.mountEffect).type.toBeCallableWith(
      Picker,
      {},
      document.body,
      options
    )
  })

  it("mount rejects a root of another vocabulary", () => {
    const Native: View.Vocabulary<Native> = { name: "native", tags: {} }
    const App = Component.define({
      name: "App",
      model: Schema.Number,
      message: Msg,
      elements: Native
    }).make({
      init: () => 0,
      update: ($) => $.model,
      view: (h) => h.view
    })
    expect(BrowserHost.mount).type.not.toBeCallableWith(App, {}, document.body)
    expect(BrowserHost.mountEffect).type.not.toBeCallableWith(
      App,
      {},
      document.body
    )
  })
})
