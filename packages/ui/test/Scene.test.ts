import { Component, Feature, Mount, type View } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { HtmlLocator } from "@effect/ui/html/testing"
import { Locator, Scene } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Cause, Effect, Redacted, Schema } from "effect"
import { Badge, BadgeRef, Note, NoteEvents, NoteMessage, SaveNote } from "./fixtures/notes.ts"
import { defect } from "./utils/scoped.ts"

const save = HtmlLocator.role("button", { name: "save" })
const saveAgain = HtmlLocator.role("button", { name: "save again" })
const text = HtmlLocator.label("Text")
const status = HtmlLocator.role("status")

describe("Scene", () => {
  it.effect("follows a flow: an interaction, a Command resolved, an event acknowledged, an ignored interaction", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Note, {})
      s.fire(text, "input", { value: "milk", checked: false })
        .click(save)
        .expect(Locator.text("saving")).toExist()
        .expectExact(SaveNote({ text: "milk" }))
        .resolve(SaveNote, NoteMessage.make({ _tag: "Saved" }))
        .emitted(NoteEvents.make({ _tag: "Saved", text: "milk" }))
        .expect(status).toHaveText("saved milk")
        // Already saved: the handler returns no message.
        .click(saveAgain)
        .expectIgnored()
    }))

  it.effect("an interaction throws while a Command is pending, until keepPending names it", () =>
    Effect.gen(function*() {
      const s = Scene.start(Note, {})
      s.click(save)
      assert.throws(
        () => s.click(saveAgain),
        /^Scene\.click: earlier work isn't settled or acknowledged:\n {2}- notes\/SaveNote\(\{"text":""\}\) \[running\] is pending: settle it with resolve or fail, or keep it with keepPending/
      )
      s.keepPending(SaveNote).click(saveAgain).expectExact(SaveNote({ text: "" }), SaveNote({ text: "" }))
      assert.throws(() => s.childEmit(Badge, BadgeRef, { _tag: "Opened", count: 1 }), /^Scene\.childEmit: earlier work/)
      // Kept or not, the end of make checks it.
      const message = yield* defect(Effect.gen(function*() {
        const s = yield* Scene.make(Note, {})
        s.click(save).keepPending(SaveNote)
      }))
      assert.match(message, /^Scene\.make: the test ends with work not settled or acknowledged:\n {2}- notes\/SaveNote/)
    }))

  it.effect("an ignored interaction is acknowledged with expectIgnored, before the next acting step and by the end", () =>
    Effect.gen(function*() {
      const s = Scene.start(Note, {}).given((model) => ({ ...model, saved: true }))
      s.click(saveAgain)
      assert.throws(() => s.expectHandled(), /^Scene\.expectHandled: the last interaction produced no message/)
      assert.throws(
        () => s.fire(text, "input", { value: "x", checked: false }),
        /the last interaction produced no message: acknowledge it with expectIgnored/
      )
      s.expectIgnored().fire(text, "input", { value: "x", checked: false }).expectHandled()
      assert.throws(() => s.expectIgnored(), /^Scene\.expectIgnored: the last interaction produced a message/)
      const message = yield* defect(Effect.gen(function*() {
        const s = yield* Scene.make(Note, {})
        s.given((model) => ({ ...model, saved: true })).click(saveAgain)
      }))
      assert.match(
        message,
        /^Scene\.make: .*\n {2}- the last interaction produced no message: acknowledge it with expectIgnored/
      )
    }))

  it("expect checks what a locator matches, and a failure lists the view's elements", () => {
    const s = Scene.start(Note, {})
    s.expect(save).toExist()
      .expect(Locator.text("missing")).toBeAbsent()
      .expect(Locator.tag("button")).toHaveCount(2)
      .expect(save).toHaveText(/^save$/)
    assert.throws(
      () => s.expect(Locator.text("missing")).toExist(),
      /^Scene\.expect\(text "missing"\)\.toExist\(\): nothing matches; elements:\n {2}<div>savesave again\n {2}<input aria-label="Text">/
    )
    assert.throws(() => s.expect(Locator.tag("button")).toHaveText("save"), /toHaveText\("save"\): 2 elements match/)
    assert.throws(() => s.expect(save).toHaveText("saving"), /toHaveText\("saving"\): its text is "save"/)
    assert.throws(() => s.expect(Locator.tag("button")).toHaveCount(1), /toHaveCount\(1\): 2 elements match/)
    assert.throws(() => s.expect(save).toBeAbsent(), /toBeAbsent\(\): 1 elements match/)
  })

  it("fire throws when nothing handles the event, submit included", () => {
    const s = Scene.start(Note, {})
    assert.throws(() => s.fire(status, "submit"), /^Scene\.fire: nothing handles "submit" at role "status"/)
    assert.throws(() => s.click(status), /^Scene\.click: nothing handles "click"/)
  })

  it.effect("childEmit is typed by the child, and throws when the slot holds another component", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Note, {})
      s.childEmit(Badge, BadgeRef, { _tag: "Opened", count: 2 }).expect(status).toHaveText("opened 2")
      assert.throws(
        () => Scene.start(Note, {}).childEmit(Note, BadgeRef, { _tag: "Saved", text: "" }),
        /^Scene\.childEmit: the child at the ref Badge is Badge, not Note/
      )
    }))

  it.effect("childEmit names a feature child by its service", () =>
    Effect.gen(function*() {
      const Changed = Schema.TaggedUnion({ Changed: { to: Schema.String } })
      class Panel extends Feature.Service<Panel>()("Panel", { props: Schema.Struct({}), events: Changed }) {}
      const Page = Component.define({ name: "Page", model: Schema.String, message: Schema.String, elements: Html })
        .make({
          init: () => "",
          update: (_, message) => message,
          view: (seen, h) =>
            h.div(h.p(seen), Panel.render(h, { key: "panel", fallback: () => h.i(), onEmit: (event) => event.to }))
        })
      const s = yield* Scene.make(Page, {})
      s.childEmit(Panel, "panel", { _tag: "Changed", to: "dark" }).expect(Locator.tag("p")).toHaveText("dark")
      assert.throws(
        () => Scene.start(Page, {}).childEmit(Badge, "panel", { _tag: "Opened", count: 1 }),
        /^Scene\.childEmit: the child at "panel" is Panel, not Badge/
      )
    }))

  it.effect("childFailure sends what onFailure maps, and does nothing without one", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(Note, {})
      s.childFailure(BadgeRef, Cause.fail("boom")).expect(status).toHaveText("")
    }))

  describe("mounts", () => {
    const Measure = Mount.make(
      "Measure",
      { args: { id: Schema.String } },
      (node: HTMLElement) => Effect.sync(() => node.clientWidth)
    )
    const Hello = Mount.make("Hello", { args: {} }, () => Effect.succeed(Component.noop))
    const Rows = Component.define({
      name: "Rows",
      props: Schema.Struct({ shown: Schema.Boolean }),
      model: Schema.Array(Schema.String),
      message: Schema.String,
      elements: Html
    }).make({
      init: (): ReadonlyArray<string> => [],
      update: (log, message) => [...log, message],
      view: (log, h) =>
        h.div(
          h.props.shown && h.ul.onMount(Hello()).children(
            ["a", "b"].map((id) =>
              h.li.key(id).onMount(Measure({ id }).pipe(Mount.map((width) => `${id} is ${width}`))).children(id)
            )
          ),
          h.p(log.join(", ")),
          h.button.onClick("clicked").children("go")
        )
    })
    const log = Locator.tag("p")
    const go = Locator.tag("button")

    it.effect("mounted ends the one mount matching a definition or its args, through the view's Mount.map", () =>
      Effect.gen(function*() {
        const s = yield* Scene.make(Rows, { shown: true })
        assert.throws(
          () => s.mounted(Measure, 40),
          /^Scene\.mounted: 2 rendered mounts match Measure; mounts: Hello\(\{\}\), Measure\(\{"id":"a"\}\), Measure\(\{"id":"b"\}\)$/
        )
        assert.throws(
          () => s.expectMount(Measure({ id: "c" })),
          /^Scene\.expectMount: no rendered mount matches Measure\(\{"id":"c"\}\)/
        )
        s.mounted(Measure({ id: "b" }), 40).mounted(Measure({ id: "a" }), 20).mounted(Hello)
          .expect(log).toHaveText("b is 40, a is 20")
      }))

    it.effect("a new mount blocks a message step and the end of make until a step names it, and ends once", () =>
      Effect.gen(function*() {
        const s = Scene.start(Rows, { shown: true })
        assert.throws(
          () => s.click(go),
          /^Scene\.click: earlier work isn't settled or acknowledged:\n {2}- the mount Hello\(\{\}\) on <ul> started/
        )
        const message = yield* defect(Effect.gen(function*() {
          const s = yield* Scene.make(Rows, { shown: true })
          s.mounted(Hello)
        }))
        assert.match(
          message,
          /^Scene\.make: the test ends with work not settled or acknowledged:\n {2}- the mount Measure\(\{"id":"a"\}\) on <li> started/
        )
        s.mounted(Hello).expectMount(Measure({ id: "a" })).expectMount(Measure({ id: "b" })).click(go)
        assert.throws(() => s.mounted(Hello), /^Scene\.mounted: the mount Hello\(\{\}\) already ended/)
      }))

    it.effect("a step that removes a mount nothing named throws, and given makes the view's mounts new", () =>
      Effect.gen(function*() {
        const ack = (s: Scene.Steps<typeof Rows>) =>
          s.mounted(Hello).expectMount(Measure({ id: "a" })).expectMount(Measure({ id: "b" }))
        assert.throws(
          () => Scene.start(Rows, { shown: true }).props({ shown: false }),
          /^Scene\.props: the step removed a mount nothing acknowledged:\n {2}- Hello\(\{\}\) on <ul>/
        )
        // A patch keeps a mount running, acknowledged: removing it then is fine.
        const s = yield* Scene.make(Rows, { shown: true })
        ack(s).click(go).props({ shown: false })
        const message = yield* defect(Effect.gen(function*() {
          const s = yield* Scene.make(Rows, { shown: true })
          ack(s).given(["x"])
        }))
        assert.match(message, /^Scene\.make: .*\n {2}- the mount Hello\(\{\}\) on <ul> started/)
      }))

    it.effect("a root headless child with a new key is a new child, so its mounts are new, its view node cached or not", () =>
      Effect.gen(function*() {
        const Wrapper = Component.define({ name: "Wrapper", model: Schema.Null, message: Schema.Never })
          .make({ init: () => null, update: (model) => model, parts: () => ({}) })
        const rootOf = (cache: boolean) => {
          let cached: View.Node<never> | undefined
          return Component.define({
            name: "Root",
            props: Schema.Struct({ childKey: Schema.String }),
            model: Schema.Null,
            message: Schema.Never,
            elements: Html
          }).make({
            init: () => null,
            update: (model) => model,
            view: (_, h) => {
              const fresh = h.div.onMount(Hello()).children()
              const tree = cache ? cached ??= fresh : fresh
              return Wrapper(h, { key: h.props.childKey, view: () => tree })
            }
          })
        }
        for (const Root of [rootOf(false), rootOf(true)]) {
          // The same key patches the child: its mount keeps running, acknowledged.
          const s = yield* Scene.make(Root, { childKey: "a" })
          s.expectMount(Hello()).props({ childKey: "a" })
          const message = yield* defect(Effect.gen(function*() {
            const s = yield* Scene.make(Root, { childKey: "a" })
            s.expectMount(Hello()).props({ childKey: "b" })
          }))
          assert.match(message, /^Scene\.make: .*\n {2}- the mount Hello\(\{\}\) on <div> started/)
        }
      }))

    it.effect("args compare by their Schema, and a redacted arg stays out of the failure message", () =>
      Effect.gen(function*() {
        const Connect = Mount.make(
          "Connect",
          { args: { token: Schema.Redacted(Schema.String) } },
          () => Effect.succeed(Component.noop)
        )
        const Socket = Component.define({ name: "Socket", model: Schema.Null, message: Schema.Never, elements: Html })
          .make({
            init: () => null,
            update: (model) => model,
            view: (_, h) => h.div.onMount(Connect({ token: Redacted.make("secret") }))
          })
        const s = yield* Scene.make(Socket, {})
        const error = assert.throws(() => s.expectMount(Connect({ token: Redacted.make("other") })))
        assert.include(String(error), "no rendered mount matches Connect(")
        assert.notInclude(String(error), "secret")
        assert.notInclude(String(error), "other")
        // Two Redacted values aren't Equal, but the Schema's equivalence compares what they hold.
        s.expectMount(Connect({ token: Redacted.make("secret") }))
      }))

    it.effect("only the scene's component's mounts count: a part's it owns and its slot content's, not a headless child's", () =>
      Effect.gen(function*() {
        const Place = Mount.make("Place", { args: {} }, (node: HTMLElement) => Effect.sync(() => node.clientWidth))
        const Anchor = Component.define({
          name: "Anchor",
          model: Schema.Number,
          message: Schema.Number,
          elements: Html
        })
          .make({
            init: () => 0,
            update: (_, width) => width,
            parts: (width, p) => ({
              width,
              anchor: p.part("button", (b) => b.onMount(Place().pipe(Mount.map((width) => width * 2))))
            })
          })
        const anchor = yield* Scene.make(
          Anchor,
          {},
          { elements: Html, view: (p, h) => h.div(p.anchor(h.button).children("target"), h.p(String(p.width))) }
        )
        anchor.mounted(Place, 21).expect(Locator.tag("p")).toHaveText("42")
        const Frame = Component.define({
          name: "Frame",
          model: Schema.Null,
          message: Schema.Never,
          elements: Html,
          slots: ["body"]
        }).make({ init: () => null, update: (model) => model, view: (_, h) => h.section(h.slots.body) })
        const Page = Component.define({ name: "Page", model: Schema.String, message: Schema.String, elements: Html })
          .make({
            init: () => "",
            update: (_, message) => message,
            view: (seen, h) =>
              h.div(
                Frame(h, {
                  key: "frame",
                  slots: { body: h.div.onMount(Measure({ id: "body" }).pipe(Mount.map(String))) }
                }),
                Anchor(h, { key: "anchor", view: (p) => p.anchor(h.button).children("go") }),
                h.p(seen)
              )
          })
        const page = yield* Scene.make(Page, {})
        page.mounted(Measure, 42).expect(Locator.tag("p")).toHaveText("42")
        const frame = yield* Scene.make(Frame, {}, { slots: (h) => ({ body: h.div.onMount(Hello()) }) })
        assert.throws(() => frame.mounted(Hello), /no rendered mount matches Hello; mounts: nothing/)
      }))
  })

  it("has no send, no Model and no query results", () => {
    const s = Scene.start(Note, {})
    assert.isUndefined((s as any).send)
    assert.isUndefined((s as any).model)
    assert.notProperty(s.current, "model")
    assert.notProperty(s.current, "results")
    assert.notProperty(s.current, "queries")
  })

  it("lists the queries on the record from make, current and check", () => {
    const names = (record: Scene.Scene<any, any, any, any>) => record.queryInfo().map((info) => info.name)
    const final = Scene.make(Note, {}, (s) => {
      assert.deepStrictEqual(names(s.current), ["author"])
      s.check((scene) => assert.deepStrictEqual(names(scene), ["author"]))
    })
    assert.deepStrictEqual(names(final), ["author"])
  })
})
