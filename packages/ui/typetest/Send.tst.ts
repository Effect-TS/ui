import { Component, Feature, UiSchema, type View } from "@effect/ui"
import { Scene, Story } from "@effect/ui/testing"
import { Context, Effect, Layer, Schema } from "effect"
import { AsyncResult } from "effect/reactivity"
import { describe, expect, it } from "tstyche"

const EditorMessage = UiSchema.TaggedEnum({ Clear: {}, Focus: {}, Typed: { text: Schema.String } })
type EditorMessage = typeof EditorMessage.Type
type Received = Extract<EditorMessage, { readonly _tag: "Clear" | "Focus" }>

const Editor = Component.define({
  name: "Editor",
  scoped: false,
  model: Schema.String,
  message: EditorMessage,
  shares: { value: (text) => ({ text }), receives: ["Clear", "Focus"] }
}).make({
  init: () => "",
  update: (text, message) => message._tag === "Typed" ? message.text : message._tag === "Clear" ? "" : text,
  parts: () => ({})
})

const Field = Component.define({ name: "Field", scoped: false, model: Schema.String, message: EditorMessage }).make({
  init: () => "",
  update: (text) => text,
  parts: () => ({})
})

const Plain = Component.define({ name: "Plain", scoped: false, model: Schema.Null, message: EditorMessage }).make({
  init: () => null,
  update: (model) => model,
  view: (_, h) => h.el("p")
})

const Note = Component.define({ name: "Note", scoped: false, model: Schema.String, message: EditorMessage }).make({
  init: () => "",
  update: (text) => text,
  view: (text, h) => h.el("p", text)
})

class Store extends Context.Service<Store, { readonly draft: string }>()("typetest/send/Store") {}

declare const NeedsStore: Component.Component<"NeedsStore", {}, string, EditorMessage, never, Store, never, {}>

declare const condition: boolean
const PlainOrNote = condition ? Plain : Note

declare const anyFeature: Feature.Any

declare const untrusted: unknown

const ParentMessage = UiSchema.TaggedEnum({ Go: {} })
const ParentDef = Component.define({ name: "Parent", scoped: false, model: Schema.Null, message: ParentMessage })

describe("Component receives", () => {
  it("is the Schema of the listed cases", () => {
    expect(Editor.receives).type.toBe<Schema.Codec<Received, any>>()
  })

  it("rejects a tag that isn't one of the message's", () => {
    expect(Component.define).type.not.toBeCallableWith({
      name: "Bad",
      model: Schema.Null,
      message: EditorMessage,
      shares: { value: () => null, receives: ["Delete"] }
    })
  })
})

describe("$.send", () => {
  it("takes a message the owner receives, and rejects any other", () => {
    ParentDef.update((model, _msg, $) => {
      expect($.send(Editor, { _tag: "Clear" })).type.not.toRaiseError()
      expect($.send(Editor, EditorMessage.Focus())).type.not.toRaiseError()
      expect($.send).type.not.toBeCallableWith(Editor, EditorMessage.Typed({ text: "x" }))
      // `make` returns the whole Message, which includes a case Editor doesn't receive.
      expect($.send).type.not.toBeCallableWith(Editor, EditorMessage.make({ _tag: "Clear" }))
      expect($.send).type.not.toBeCallableWith(Editor, untrusted)
      return model
    })
  })

  it("can't send to a child that isn't an owner", () => {
    ParentDef.update((model, _msg, $) => {
      expect($.send).type.not.toBeCallableWith(Field, EditorMessage.Clear())
      expect($.send).type.not.toBeCallableWith(Plain, EditorMessage.Clear())
      expect($.send).type.not.toBeCallableWith(anyFeature, { _tag: "Clear" })
      return model
    })
  })

  it("isn't available in init", () => {
    ParentDef.make({
      init: ($) => {
        expect($.set(null)).type.not.toHaveProperty("send")
        return null
      },
      update: (model) => model,
      view: (_, h) => h.el("p")
    })
  })
})

const NestMessage = UiSchema.TaggedEnum({ Pick: {}, Picked: {}, Closed: {} })
type NestMessage = typeof NestMessage.Type

const NestDef = Component.define({
  name: "Nest",
  scoped: false,
  model: Schema.Number,
  message: NestMessage,
  shares: { value: (picked) => picked, receives: ["Picked"] },
  shared: { parent: { owner: "self", optional: true } }
})

const FlatDef = Component.define({
  name: "Flat",
  scoped: false,
  model: Schema.Number,
  message: NestMessage,
  shares: { value: (picked) => picked, receives: ["Picked"] }
})

describe("$.send to self", () => {
  it("takes a message the component receives, and requires nothing", () => {
    NestDef.update((model, _msg, $) => {
      expect($.send("self", NestMessage.Picked())).type.toBe<Component.Step<number, NestMessage, never, never>>()
      expect($.send("self", { _tag: "Picked" })).type.not.toRaiseError()
      expect($.send).type.not.toBeCallableWith("self", NestMessage.Closed())
      expect($.send).type.not.toBeCallableWith("self", { _tag: "Pick" })
      return model
    })
  })

  it("is rejected in a component that doesn't read its own kind", () => {
    FlatDef.update((model, _msg, $) => {
      expect($.send).type.not.toBeCallableWith("self", NestMessage.Picked())
      return model
    })
  })

  it("types in slices and combine, and in a scene as a send to the component", () => {
    const picked = NestDef.update("Pick", (_, __, $) => $.send("self", NestMessage.Picked()))
    const Nest = NestDef.make({
      init: () => 0,
      update: {
        Pick: picked,
        Picked: (_, __, $) => $.combine((n, __, $) => $.send("self", NestMessage.Picked()).set(n + 1)),
        Closed: (model) => model
      },
      parts: (picked) => ({ picked })
    })
    expect<Component.Requirements<typeof Nest>>().type.toBe<never>()
    const scene = Scene.start(Nest, {}, { view: (_, h) => h.el("p") }).shared(Nest, 0)
    expect(scene.sent(Nest, NestMessage.Picked())).type.not.toRaiseError()
    expect(scene.sent).type.not.toBeCallableWith(Nest, NestMessage.Closed())
  })
})

describe("a component child", () => {
  it("stores and inspects features and components in their erased forms", () => {
    class Panel extends Feature.Service<Panel>()("Panel", {
      props: Schema.Struct({}),
      events: UiSchema.TaggedEnum({ Changed: {} })
    }) {}
    class Bare extends Feature.Service<Bare>()("Bare", { props: Schema.Struct({}) }) {}
    expect([Panel, Bare]).type.toBeAssignableTo<ReadonlyArray<Feature.Any>>()
    expect([Plain, Note, NeedsStore]).type.toBeAssignableTo<ReadonlyArray<Component.Any>>()
    ParentDef.view((_, h) => {
      const child = Panel.render(h, { key: "p", fallback: () => h.el("p") })
      expect(child.component).type.toBeAssignableFrom(Panel)
      expect(child.component).type.toBeAssignableFrom(Bare)
      expect(Scene.fallback(Plain(h, { key: "a" }), Plain, "a", AsyncResult.initial())).type.not.toRaiseError()
      return h.el("p")
    })
    expect(Scene.start(Plain, {}).childEmit(Plain, "a", {} as never)).type.not.toRaiseError()
  })

  it("takes an optional key", () => {
    ParentDef.view((_, h) => {
      expect(Plain(h, { key: "a" })).type.not.toRaiseError()
      expect(Plain(h, {})).type.not.toRaiseError()
      return h.el("p")
    })
  })

  it("checks a union of components against each member", () => {
    ParentDef.view((_, h) => {
      expect((condition ? Plain : Note)(h, { key: "e" })).type.not.toRaiseError()
      expect(PlainOrNote(h, { key: "p" })).type.toBe<View.Child<typeof ParentMessage.Type, never>>()
      return h.el("p")
    })
  })

  it("takes the parent's message as an explicit type argument", () => {
    type Msg = typeof ParentMessage.Type
    class Bare extends Feature.Service<Bare>()("Bare", { props: Schema.Struct({}) }) {}
    ParentDef.view((_, h) => {
      expect(Plain<Msg>(h, { key: "a" })).type.not.toRaiseError()
      expect(Bare.render<Msg>(h, { key: "b", fallback: () => h.el("p") })).type.not.toRaiseError()
      // `Msg` comes from `h`: a different one is rejected.
      expect(Plain<Received>).type.not.toBeCallableWith(h, { key: "a" })
      return h.el("p")
    })
  })

  it("keeps requirements and provided components", () => {
    ParentDef.view((_, h) => {
      expect(NeedsStore(h, { key: "a" })).type.toBe<View.Child<typeof ParentMessage.Type, Store>>()
      expect(Plain.pipe(Component.provide(Layer.succeed(Store, { draft: "" })))(h, { key: "a" })).type
        .not.toRaiseError()
      // Provided inline, data-first.
      expect(Component.provide(Plain, Layer.succeed(Store, { draft: "" }))(h, { key: "a" })).type.toBe<
        View.Child<typeof ParentMessage.Type, never>
      >()
      expect(Component.provide(NeedsStore, Layer.empty)(h, { key: "a" })).type.toBe<
        View.Child<typeof ParentMessage.Type, Store>
      >()
      return h.el("p")
    })
  })
})

describe("Component.provide", () => {
  it("infers an inline component given to provide with a failing Layer", () => {
    const make = () =>
      Component.define({
        name: "Inline",
        scoped: false,
        props: Schema.Struct({ name: Schema.String }),
        model: Schema.Null,
        message: Schema.String
      })
        .make({ init: () => null, update: (model) => model, view: (_, h) => h.el("p", h.props.name) })
    type Inline = Component.Component<"Inline", { readonly name: string }, null, string, never, never, never, {}, never>
    expect(Component.provide(
      Component.define({
        name: "Inline",
        scoped: false,
        props: Schema.Struct({ name: Schema.String }),
        model: Schema.Null,
        message: Schema.String
      })
        .make({ init: () => null, update: (model) => model, view: (_, h) => h.el("p", h.props.name) }),
      (props) => Layer.effect(Store, props.name === "" ? Effect.fail("no") : Effect.succeed({ draft: props.name })),
      { onFailure: () => "failed" }
    )).type.toBe<Inline>()
    expect(Component.provide(
      Component.define({
        name: "Inline",
        scoped: false,
        props: Schema.Struct({ name: Schema.String }),
        model: Schema.Null,
        message: Schema.String
      })
        .make({ init: () => null, update: (model) => model, view: (_, h) => h.el("p", h.props.name) }),
      Layer.effect(Store, Effect.fail("no")),
      { onFailure: () => "failed" }
    )).type.toBe<Inline>()
    // The handler still returns one of the component's messages.
    expect(Component.provide).type.not.toBeCallableWith(make(), Layer.effect(Store, Effect.fail("no")), {
      onFailure: () => 1
    })
    expect(Component.provide).type.not.toBeCallableWith(
      make(),
      (props: { readonly name: string }) => Layer.effect(Store, Effect.fail(props.name)),
      { onFailure: () => 1 }
    )
  })

  it("rejects a message from onFailure for an erased component", () => {
    // An erased component takes no message, whatever the component behind it takes.
    const erased: Component.Any = Plain
    expect(Component.provide).type.not.toBeCallableWith(erased, Layer.effect(Store, Effect.fail("no")), {
      onFailure: () => 123
    })
    expect(Component.provide).type.not.toBeCallableWith(erased, () => Layer.effect(Store, Effect.fail("no")), {
      onFailure: () => 123
    })
    expect(Component.provide(erased, Layer.succeed(Store, { draft: "" }))).type.toBe<Component.Any>()
  })

  it("takes options without a handler for an erased component", () => {
    const erased: Component.Any = Plain
    expect(Component.provide(erased, Layer.empty, undefined)).type.toBe<Component.Any>()
    expect(Component.provide(erased, Layer.empty, {})).type.toBe<Component.Any>()
    expect(Component.provide(erased, Layer.empty, { onFailure: undefined })).type.toBe<Component.Any>()
    expect(Component.provide(erased, Layer.effect(Store, Effect.fail("no")), {
      onFailure: () => {
        throw new Error("no")
      }
    })).type.toBe<Component.Any>()
  })

  it("checks a forwarded onFailure that is optional", () => {
    // A Layer that can't fail still calls the handler on a defect.
    const erased: Component.Any = Plain
    const dies = Layer.effect(Store, Effect.die("boom"))
    const options: { readonly onFailure?: (() => number) | undefined } = { onFailure: () => 123 }
    const maybe: { readonly onFailure: () => number } | undefined = condition ? { onFailure: () => 123 } : undefined
    const throws: { readonly onFailure?: (() => never) | undefined } = {}
    expect(Component.provide).type.not.toBeCallableWith(erased, dies, options)
    expect(Component.provide).type.not.toBeCallableWith(erased, Layer.effect(Store, Effect.fail("no")), options)
    expect(Component.provide).type.not.toBeCallableWith(erased, dies, maybe)
    expect(Component.provide(erased, dies, throws)).type.toBe<Component.Any>()
  })

  it("forwards options constrained to a handler that returns no message", () => {
    expect(<O extends Component.ProvideRest<typeof Layer.empty, never>[0]>(component: Component.Any, options: O) =>
      Component.provide(component, Layer.empty, options)
    ).type.not.toRaiseError()
    expect(<O extends Component.ProvideOptions<string, never>>(component: Component.Any, options: O) =>
      Component.provide(component, () => Layer.effect(Store, Effect.fail("no")), options)
    ).type.not.toRaiseError()
    // A constraint that lets the handler return a message isn't safe to forward.
    const unsafe = <O extends { readonly onFailure?: (() => number) | undefined }>(
      component: Component.Any,
      options: O
    ) => {
      // @ts-expect-error No overload matches this call
      return Component.provide(component, Layer.empty, options)
    }
    expect(unsafe).type.toBeCallableWith(Plain, {})
  })

  it("checks an overloaded onFailure by the call it gets", () => {
    // The last overload returns nothing, but a failure gets the first, which returns a number.
    function onFailure(failure: AsyncResult.Failure<never, string>): number
    function onFailure(failure: never): never
    function onFailure(_failure: unknown): number {
      return 123
    }
    const erased: Component.Any = Plain
    expect(Component.provide).type.not.toBeCallableWith(erased, Layer.effect(Store, Effect.fail("no")), { onFailure })
    expect(Component.provide).type.not.toBeCallableWith(erased, () => Layer.effect(Store, Effect.fail("no")), {
      onFailure
    })
  })
})

describe("an erased component", () => {
  // Component.Any, and a component whose props are `Schema.Any`.
  const any: Component.Any = Plain
  const AnyProps = Component.define({
    name: "AnyProps",
    scoped: false,
    props: Schema.Any,
    model: Schema.Null,
    message: EditorMessage
  })
    .make({ init: () => null, update: (model) => model, view: (_, h) => h.el("p") })

  it("takes props, with an optional key", () => {
    const erased = Story.start(Plain, {}).current.component
    ParentDef.view((_, h) => {
      expect(any(h, { key: "a", props: {} })).type.toBe<View.Child<typeof ParentMessage.Type, any>>()
      expect(AnyProps(h, { key: "a", props: 1 })).type.not.toRaiseError()
      expect(any).type.not.toBeCallableWith(h, { key: "a" })
      expect(AnyProps).type.not.toBeCallableWith(h, { key: "a" })
      expect(any(h, { props: {} })).type.not.toRaiseError()
      expect(erased(h, { key: "a" })).type.not.toRaiseError()
      return h.el("p")
    })
  })

  it("checks callbacks against the parent's message", () => {
    ParentDef.view((_, h) => {
      expect(any(h, { key: "a", props: {}, onEmit: () => ({ _tag: "Go" as const }) })).type.not.toRaiseError()
      expect(any).type.not.toBeCallableWith(h, { key: "a", props: {}, onEmit: () => 1 })
      expect(any).type.not.toBeCallableWith(h, { key: "a", props: {}, onFailure: () => 1 })
      expect(any).type.not.toBeCallableWith(h, { key: "a", props: {}, fallback: () => 1 })
      expect(AnyProps).type.not.toBeCallableWith(h, { key: "a", props: 1, onEmit: () => 1 })
      return h.el("p")
    })
  })
})
