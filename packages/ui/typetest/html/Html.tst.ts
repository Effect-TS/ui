import { Component, Mount, Renderer, Route, Router, UiSchema, type View } from "@effect/ui"
import { BrowserHost, DomCommand, DomSubscription, Html, HtmlServer } from "@effect/ui/html"
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

class Clock extends Context.Service<Clock, { readonly now: Effect.Effect<number> }>()("Clock") {}
class Logger extends Context.Service<Logger, { readonly log: (line: string) => Effect.Effect<void> }>()("Logger") {}

const Tick = Mount.make("Tick", { args: {} }, () => Clock.use((clock) => clock.now))
const LogUp = Mount.make(
  "LogUp",
  { args: {} },
  () => Logger.use((logger) => logger.log("up")).pipe(Effect.as(Msg.Mounted()))
)
const Measure = Mount.make("Measure", { args: {} }, (node: HTMLElement) => Effect.sync(() => node.clientWidth))

const Ticker = Component.define({
  name: "Ticker",
  scoped: false,
  model: Schema.Number,
  message: Schema.Number,
  elements: Html
}).make({
  init: () => 0,
  update: (_, now) => now,
  view: (now, h) => h.time.onMount(Tick()).children(String(now))
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
  it("registers nothing: only `@effect/ui/html/register` does", () => {
    expect<View.Registered>().type.toBe<never>()
  })

  it("the module is a vocabulary", () => {
    expect(Html).type.toBeAssignableTo<View.Vocabulary<Html.Elements>>()
    Component.define({
      name: "Tags",
      scoped: false,
      model: Schema.String,
      message: Msg,
      elements: Html
    }).make({
      init: () => "",
      update: (model) => model,
      view: (_, h) => {
        expect(h.div(h.span("text"), "more")).type.toBe<
          Html.Element<Msg, never, Html.EventsOf<"div">, HTMLDivElement, "div">
        >()
        expect(h.div.class("box")).type.toBe<Html.Element<Msg, never, Html.EventsOf<"div">, HTMLDivElement, "div">>()
        expect(h.input).type.toBe<Html.VoidElement<Msg, never, Html.EventsOf<"input">, HTMLInputElement, "input">>()
        expect(h).type.not.toHaveProperty("script")
        return h.div()
      }
    })
  })

  it("children returns the builder, so more children and attributes can follow", () => {
    Component.define({
      name: "Order",
      scoped: false,
      model: Schema.String,
      message: Msg,
      elements: Html
    }).make({
      init: () => "",
      update: (model) => model,
      view: (draft, h) => {
        const form = h.form.onSubmit(Msg.Sent({ title: draft })).children(
          h.input.ref(Field).value(draft).onInput(({ value }) => Msg.Typed({ value })),
          h.button.attr("type", "submit").children("Add"),
          h.span(draft),
          h.br
        )
        expect(form).type.toBe<Html.Element<Msg, never, Html.EventsOf<"form">, HTMLFormElement, "form">>()
        // The shorthand and `children` both return the builder, with the children's requirements.
        const needsClock = {} as View.Node<Msg, Clock>
        expect(h.div("a").class("box").children(needsClock)).type.toBe<
          Html.Element<Msg, Clock, Html.EventsOf<"div">, HTMLDivElement, "div">
        >()
        // It is content, not a node: nothing reads its children off it.
        expect(h.div.children("a")).type.toBeAssignableTo<View.Content<Msg, never>>()
        expect(h.div.children("a")).type.not.toHaveProperty("_tag")
        // A chained builder isn't callable: only the root is shorthand.
        expect(h.div).type.toBeCallableWith("a")
        expect(h.div("a")).type.not.toBeAssignableTo<(...args: never) => unknown>()
        expect(h.div.class("box")).type.not.toBeAssignableTo<(...args: never) => unknown>()
        expect(h.div.class("box").children).type.toBeCallableWith("a", h.br, [h.span("b")], false, null, undefined)
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
    Component.define({
      name: "Forward",
      scoped: false,
      model: Schema.String,
      message: Msg,
      elements: Html
    }).make({
      init: () => "",
      update: (model) => model,
      view: (_, h) => {
        const needsClock = {} as View.Node<Msg, Clock>
        const framed = h.button.forward((node) => {
          expect(node).type.toBe<Html.Element<Msg, never, Html.EventsOf<"button">, HTMLButtonElement, "button">>()
          return h.div.class("frame").children(node, needsClock)
        })
        expect(framed).type.toBe<Html.Element<Msg, Clock, Html.EventsOf<"button">, HTMLButtonElement, "button">>()
        expect(framed.attr("title", "Go").attrs({ id: "go", "aria-label": undefined }).children("Go")).type.toBe<
          Html.Element<Msg, Clock, Html.EventsOf<"button">, HTMLButtonElement, "button">
        >()
        // A void element keeps its class, and still takes no children.
        const input = h.input.forward((node) => h.label.children("Amount", node))
        expect(input.value("1")).type.toBe<
          Html.VoidElement<Msg, never, Html.EventsOf<"input">, HTMLInputElement, "input">
        >()
        expect(input).type.not.toHaveProperty("children")
        // The function returns an element: not text, and not a component's child.
        expect(h.button.forward).type.not.toBeCallableWith(() => "Go")
        expect(h.button.forward).type.not.toBeCallableWith(() => ({}) as View.Child<Msg, never>)
        return framed
      }
    })
  })

  it("errors point at the offending child", () => {
    Component.define({
      name: "Errors",
      scoped: false,
      model: Schema.String,
      message: Msg,
      elements: Html
    }).make({
      init: () => "",
      update: (model) => model,
      view: (_, h) => {
        expect(h.div).type.not.toBeCallableWith(h.span("ok"), 1)
        expect(h.div.class("x").children).type.not.toBeCallableWith(h.span("ok"), { _tag: "Element" })
        return h.div()
      }
    })
  })

  it("events carry the tag's payloads", () => {
    Component.define({
      name: "Events",
      scoped: false,
      model: Schema.String,
      message: Msg,
      elements: Html
    }).make({
      init: () => "",
      update: (model) => model,
      view: (_, h) => {
        expect(h.input.onInput).type.toBeCallableWith(
          ({ checked }: Html.InputPayload) => Msg.Checked({ checked })
        )
        expect(h.textarea.on).type.toBeCallableWith(
          "input",
          ({ value }: Html.ValuePayload) => Msg.Typed({ value })
        )
        expect(h.form.onSubmit).type.toBeCallableWith(({ fields }: Html.SubmitPayload) =>
          Msg.Sent({ title: fields.title ?? "" })
        )
        expect(h.button.onClick).type.toBeCallableWith(({ shift }: Html.PointerPayload) =>
          shift ? undefined : Msg.Mounted()
        )
        expect(h.input.onCompositionEnd).type.toBeCallableWith(
          ({ value }: Html.CompositionPayload) => Msg.Typed({ value })
        )
        expect(h.textarea.on).type.toBeCallableWith(
          "compositionend",
          ({ value }: Html.CompositionPayload) => Msg.Typed({ value })
        )
        expect(h.input.onInput).type.toBeCallableWith(
          ({ composing, inputType, value }: Html.InputPayload) =>
            composing || inputType === "insertReplacementText" ? undefined : Msg.Typed({ value })
        )
        expect(h.input.onKeyDown).type.toBeCallableWith(
          ({ selectionEnd, selectionStart }: Html.KeyPayload) =>
            selectionStart === selectionEnd ? undefined : Msg.Mounted()
        )
        expect<Html.KeyPayload["selectionStart"]>().type.toBe<number | null>()
        expect<Html.KeyPayload["repeat"]>().type.toBe<boolean>()
        expect<Html.KeyPayload["editable"]>().type.toBe<boolean>()
        const shortcutHandler = Html.shortcuts([{ key: "Escape", message: Msg.Mounted(), whileTyping: true }])
        expect(h.div.onKeyDown).type.toBeCallableWith(shortcutHandler)
        expect(DomSubscription.onDocument).type.toBeCallableWith("keydown", shortcutHandler, { preventDefault: true })
        expect(h.input.onPaste).type.toBeCallableWith(
          ({ text }: Html.PastePayload) => Msg.Typed({ value: text }),
          { preventDefault: true }
        )
        expect(h.div.on).type.toBeCallableWith("paste", ({ text }: Html.PastePayload) => Msg.Typed({ value: text }))
        expect(h.div.on).type.not.toBeCallableWith("input", Msg.Mounted())
        expect(h.div.on).type.not.toBeCallableWith("submit", Msg.Mounted())
        expect(h.select.on).type.not.toBeCallableWith("compositionend", Msg.Mounted())
        expect(h.div.on).type.not.toBeCallableWith("compositionend", Msg.Mounted())
        expect(h.button.onClick).type.not.toBeCallableWith("not a message")
        return h.div()
      }
    })
  })

  it("controlled properties exist on the elements that have them", () => {
    Component.define({
      name: "Controlled",
      scoped: false,
      model: Schema.String,
      message: Msg,
      elements: Html
    }).make({
      init: () => "",
      update: (model) => model,
      view: (_, h) => {
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
        expect(h.div.onToggle).type.toBeCallableWith(
          ({ newState, oldState, open }: Html.PopoverTogglePayload) =>
            Msg.Typed({ value: `${oldState}${newState}${open}` })
        )
        return h.div()
      }
    })
  })

  it("refs and onMount are typed by tag", () => {
    expect(Field).type.toBe<Renderer.Ref<HTMLInputElement>>()
    const Focus = Mount.make("Focus", { args: {} }, (element: HTMLInputElement) => {
      expect(element).type.toBe<HTMLInputElement>()
      return Effect.succeed(Msg.Mounted())
    })
    Component.define({
      name: "Refs",
      scoped: false,
      model: Schema.String,
      message: Msg,
      elements: Html
    }).make({
      init: () => "",
      update: (model) => model,
      view: (_, h) => {
        expect(h.input.ref).type.toBeCallableWith(Field)
        expect(h.input.value("a").ref).type.toBeCallableWith(Field)
        expect(h.textarea.ref).type.not.toBeCallableWith(Field)
        expect(h.textarea.attr("rows", "2").ref).type.not.toBeCallableWith(Field)
        // A mount goes on an element whose node its body can take.
        expect(h.textarea.onMount).type.not.toBeCallableWith(Focus())
        expect(h.input.onMount).type.toBeCallableWith(Measure().pipe(Mount.map(() => Msg.Mounted())))
        return h.input.onMount(Focus())
      }
    })
  })

  it("requirements from onMount and from children reach the component", () => {
    const Mounted = Component.define({
      name: "Mounted",
      scoped: false,
      model: Schema.Null,
      message: Msg,
      elements: Html
    }).make({
      init: () => null,
      update: (model) => model,
      view: (_, h) =>
        h.div.onMount(LogUp())
          .class("box")
          .children(Ticker(h, { key: "ticker" }))
    })
    expect(Mounted).type.toBe<Component.Component<"Mounted", {}, null, Msg, never, Logger | Clock, Html.Elements>>()
    const Shorthand = Component.define({
      name: "Shorthand",
      scoped: false,
      model: Schema.Null,
      message: Msg,
      elements: Html
    }).make({
      init: () => null,
      update: (model) => model,
      view: (_, h) => h.section(h.p("clock"), [Ticker(h, { key: "ticker" })])
    })
    expect(Shorthand).type.toBe<Component.Component<"Shorthand", {}, null, Msg, never, Clock, Html.Elements>>()
    const Bare = Component.define({
      name: "Bare",
      scoped: false,
      model: Schema.Null,
      message: Msg,
      elements: Html
    }).make({
      init: () => null,
      update: (model) => model,
      view: (_, h) => h.input.onMount(LogUp())
    })
    expect(Bare).type.toBe<Component.Component<"Bare", {}, null, Msg, never, Logger, Html.Elements>>()
  })

  it("a mount may end with Component.noop, and its body gets its args and a typed Stream of them", () => {
    const Hello = Mount.make("Hello", { args: {} }, () => Effect.succeed(Component.noop))
    const DrawChart = Mount.make(
      "DrawChart",
      { args: { points: Schema.Array(Schema.Number) } },
      (node: HTMLCanvasElement, args, changes) => {
        expect(node).type.toBe<HTMLCanvasElement>()
        expect(args).type.toBe<{ readonly points: ReadonlyArray<number> }>()
        expect(changes).type.toBe<Stream.Stream<{ readonly points: ReadonlyArray<number> }>>()
        return Stream.runForEach(changes, () => Logger.use((logger) => logger.log("draw"))).pipe(
          Effect.as(Component.noop)
        )
      }
    )
    expect(DrawChart).type.not.toBeCallableWith()
    expect(DrawChart).type.not.toBeCallableWith({ points: "none" })
    const Chart = Component.define({
      name: "Chart",
      scoped: false,
      model: Schema.Array(Schema.Number),
      message: Schema.Never,
      elements: Html
    }).make({
      init: (): ReadonlyArray<number> => [],
      update: (points) => points,
      view: (points, h) => h.div.onMount(Hello()).children(h.canvas.onMount(DrawChart({ points })))
    })
    expect(Chart).type.toBe<
      Component.Component<"Chart", {}, ReadonlyArray<number>, never, never, Logger, Html.Elements>
    >()
    const div = new Html.Element<Msg, never, Record<string, unknown>, HTMLDivElement>("div")
    // A result that isn't the component's message is mapped to one first.
    expect(div.onMount).type.not.toBeCallableWith(Measure())
    expect(div.onMount).type.toBeCallableWith(Measure().pipe(Mount.map(() => Msg.Mounted())))
    // A scene's step takes the definition's own result, and none for a mount that ends with noop.
    const s = Scene.start(Chart, {})
    expect(s.mounted).type.toBeCallableWith(Measure, 300)
    expect(s.mounted).type.not.toBeCallableWith(Measure, "wide")
    expect(s.mounted).type.not.toBeCallableWith(Measure)
    expect(s.mounted).type.toBeCallableWith(Hello)
    expect(s.mounted).type.toBeCallableWith(DrawChart({ points: [] }))
  })

  it("onMount ends with a message or Component.noop, never with void or undefined", () => {
    const div = new Html.Element<Msg>("div")
    const input = new Html.VoidElement<Msg>("input")
    const Silent = Mount.make("Silent", { args: {} }, () => Effect.succeed(Component.noop))
    const Mixed = Mount.make("Mixed", { args: {} }, () =>
      Effect.gen(function*() {
        const ok = yield* Effect.succeed(true)
        return ok ? Msg.Mounted() : Component.noop
      }))
    expect(div.onMount).type.toBeCallableWith(Silent())
    expect(div.onMount).type.toBeCallableWith(Mixed())
    expect(input.onMount).type.toBeCallableWith(Silent())

    const holdsAValue: Effect.Effect<void> = Effect.succeed("not a message")
    const Void = Mount.make("Void", { args: {} }, () => Effect.void)
    const Holds = Mount.make("Holds", { args: {} }, () => holdsAValue)
    const Undefined = Mount.make("Undefined", { args: {} }, () => Effect.succeed(undefined))
    const Other = Mount.make("Other", { args: {} }, () => Effect.succeed(Symbol.for("other")))
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
    // @ts-expect-error Map its result with Mount.map
    new Html.Element<Msg, never, Record<string, unknown>, HTMLDivElement>("div").onMount(Measure())
  })

  it("View.Input keeps what a child requires", () => {
    const PageDef = Component.define({ name: "Page", scoped: false, model: Schema.Null, message: Msg, elements: Html })
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
      update: (model) => model,
      view: (_, h) => card(h, h.h1("Title"), ticker)
    })
    expect(Page).type.toBe<Component.Component<"Page", {}, null, Msg, never, Clock, Html.Elements>>()
    expect<View.Requirements<any>>().type.toBe<any>()
  })

  it("style accepts typed CSS properties and preserves the element type", () => {
    const div = new Html.Element<Msg, Clock, Html.EventsOf<"div">, HTMLDivElement, "div">("div")
    const input = new Html.VoidElement<Msg, Logger, Html.EventsOf<"input">, HTMLInputElement, "input">("input")
    expect(div.style({ color: "red", marginTop: "1rem", "--accent": "#09f" })).type.toBe<typeof div>()
    expect(input.style({ color: false, width: null, height: undefined })).type.toBe<typeof input>()
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
    expect(button.class("rounded", saving && "opacity-50", null, undefined)).type.toBe<Html.Element<Msg>>()
    expect(button.class).type.not.toBeCallableWith("rounded", true)
    expect(button.class).type.not.toBeCallableWith("rounded", 1)
    expect(button.class).type.not.toBeCallableWith(saving || "opacity-50")
    expect(button.class).type.not.toBeCallableWith(count && "badge")
    expect(Html.classNames).type.not.toBeCallableWith("rounded", true)
    expect(Html.classNames).type.not.toBeCallableWith("rounded", 1)
    expect(Html.classNames("rounded", saving && "opacity-50")).type.toBe<string>()
  })

  it("ref Commands add nothing to a component's requirements", () => {
    const Form = Component.define({
      name: "Form",
      scoped: false,
      model: Schema.String,
      message: Msg,
      elements: Html
    }).make({
      init: () => "",
      update: (_model, _, $) => $.run(DomCommand.focus(Field, ({ found }) => Msg.Focused({ found }))),
      view: (_, h) => h.input.ref(Field)
    })
    expect(Form).type.toBe<Component.Component<"Form", {}, string, Msg, never, never, Html.Elements>>()
  })
})

describe("HtmlLocator", () => {
  it("structural queries return a structural node, which compares with any node in the tree", () => {
    const tree = {
      tag: "form",
      children: [
        { tag: "label", attrs: { for: "new" }, children: [{ text: "New todo" }] },
        { tag: "input", attrs: { id: "new" } }
      ]
    }
    expect(HtmlLocator.getByRole(tree, "textbox")).type.toBe<Locator.Node>()
    expect(HtmlLocator.queryAllByRole(tree, "textbox")).type.toBe<ReadonlyArray<Locator.Node>>()
    expect(HtmlLocator.getByRole(tree, "textbox") === tree.children[1]).type.toBe<boolean>()
    expect(HtmlLocator.nameOf(tree, tree.children[1]!)).type.toBe<string>()
    expect(HtmlLocator.value(tree.children[1])).type.toBe<string | undefined>()
    expect(HtmlLocator.checked(tree.children[1])).type.toBe<boolean | undefined>()
  })

  it("DOM queries return elements", () => {
    expect(HtmlLocator.getByRole(document, "button")).type.toBe<HTMLElement>()
    expect(HtmlLocator.queryAllByRole(document.body, "button")).type.toBe<ReadonlyArray<HTMLElement>>()
  })
})

describe("BrowserHost", () => {
  const Counter = Component.define({
    name: "Counter",
    scoped: false,
    model: Schema.Number,
    message: Msg,
    elements: Html
  }).make({
    init: () => 0,
    update: (count) => count + 1,
    view: (count, h) => h.button.onClick(Msg.Mounted()).children(String(count))
  })

  it("mountEffect needs only a Scope for an HTML root", () => {
    expect(BrowserHost.mountEffect(Counter, {}, document.body)).type.toBe<
      Effect.Effect<Renderer.Root<number, Msg>, never, Scope.Scope>
    >()
  })

  it("mount is a Layer that needs nothing for an HTML root", () => {
    expect(BrowserHost.mount(Counter, {}, document.body)).type.toBe<Layer.Layer<never>>()
  })

  it("mount and renderToHtml with Router.props need the Router", () => {
    const AppRoute = Route.union({ Home: Route.make("/"), NotFound: Route.make("/*") })
    const App = Component.define({
      name: "App",
      scoped: false,
      props: Schema.Struct({ route: AppRoute }),
      model: AppRoute,
      message: Schema.Never,
      elements: Html
    }).make({
      init: ($) => $.props.route,
      update: (route) => route,
      view: (route, h) => h.h1(route._tag)
    })
    expect(BrowserHost.mount(App, Router.props(AppRoute), document.body)).type.toBe<
      Layer.Layer<never, never, Router.Router>
    >()
    expect(HtmlServer.renderToHtml(App, Router.props(AppRoute))).type.toBe<
      Effect.Effect<HtmlServer.Rendered<typeof AppRoute.Type>, never, Router.Router>
    >()
  })

  it("Renderer.mount of an HTML root needs Html.Host", () => {
    expect(Renderer.mount(Counter, {}, document.body)).type.toBe<
      Effect.Effect<Renderer.Root<number, Msg>, never, Html.Host | Renderer.Renderer | Scope.Scope>
    >()
  })

  it("mount rejects a root of another vocabulary", () => {
    const Native: View.Vocabulary<Native> = { name: "native", tags: {} }
    const App = Component.define({
      name: "App",
      scoped: false,
      model: Schema.Number,
      message: Msg,
      elements: Native
    }).make({
      init: () => 0,
      update: (count) => count,
      view: (_, h) => h.view
    })
    expect(BrowserHost.mount).type.not.toBeCallableWith(App, {}, document.body)
    expect(BrowserHost.mountEffect).type.not.toBeCallableWith(App, {}, document.body)
  })
})
