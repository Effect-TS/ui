// @vitest-environment happy-dom
import { Component, type Mount, UiSchema, type View } from "@effect/ui"
import { ToastProvider, type ToastProviderProps } from "@effect/ui-kit"
import { BrowserHost, Html } from "@effect/ui/html"
import { Locator, Scene, TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema, Scope } from "effect"
import { TestClock } from "effect/testing"

const standIn = {
  elements: Html,
  view: (
    t: Component.Headless.Parts<typeof ToastProvider>,
    h: View.Helper<never, ToastProviderProps> & View.Tags<Html.Elements, never>
  ) =>
    t.viewport(h.div.class("toasts")).children(
      ...t.toasts.map((toast) =>
        t.root({ element: h.div.class("toast").attr("data-testid", toast.id), toast }).children(
          t.content({ element: h.div, toast }).children(
            t.title({ element: h.strong, toast }).children(toast.title),
            t.description({ element: h.p, toast }).children(toast.description),
            t.close({ element: h.button.attr("data-testid", "close-" + toast.id), toast }).children("Close")
          )
        )
      )
    )
}

const viewport = Locator.attr("role", "region")
const toast = (id: string) => Locator.testId(id)

// The mounts are private, so a test reads them off the rendered element.
type Rendered = { readonly get: (locator: Locator.Locator) => Locator.Node }
const mountOf = <A>(s: Rendered, locator: Locator.Locator) =>
  (s.get(locator) as unknown as View.Element<unknown>).owned?.find((layer) => layer.mount !== undefined)
    ?.mount as unknown as Mount.Issued<unknown, never, never, A>
const trackViewport = (s: Rendered) =>
  mountOf<"FocusedViewport" | "BlurredViewport" | "FocusedWindow" | "BlurredWindow" | "LeftViewport">(s, viewport)
const trackToast = (s: Rendered, id: string) =>
  mountOf<{ readonly _tag: "Measured"; readonly height: number } | { readonly _tag: "Finished" }>(s, toast(id))

// A scene of a headless component doesn't type what it receives, so posts
// go through the provider's own type.
const post = (message: Component.Shared.Receives<typeof ToastProvider>) => message as never

// The message a wait would have produced: the Command's own result.
const completed = (id: string) => ({ _tag: "CompletedWaitBeforeDismissal", id }) as never

const waits = (
  s: { readonly current: { readonly pending: ReadonlyArray<{ readonly command: { readonly args: unknown } }> } }
) => s.current.pending.map((pending) => pending.command.args)

// An app whose editor, inside the provider's closure, posts a toast, and
// which counts the toasts the user dismissed.
const EditorMessage = UiSchema.TaggedEnum({ ClickedSave: {} })

const Editor = Component.define({ name: "Editor", model: Schema.Null, message: EditorMessage, elements: Html }).make({
  init: () => null,
  update: (model, _message, $) =>
    $.set(model).send(ToastProvider, { _tag: "AddedToast", toast: { id: "saved", title: "Saved" } }),
  view: (_, h) => h.button.attr("data-testid", "save").onClick(EditorMessage.ClickedSave()).children("Save")
})

const AppMessage = UiSchema.TaggedEnum({ DismissedToast: { id: Schema.String } })

const App = Component.define({
  name: "App",
  model: Schema.Array(Schema.String),
  message: AppMessage,
  elements: Html
}).make({
  init: () => [],
  update: (model, message) => AppMessage.match(message, { DismissedToast: ({ id }) => [...model, id] }),
  view: (model, h) =>
    ToastProvider(h, {
      onEmit: ({ id }) => AppMessage.DismissedToast({ id }),
      view: (t) =>
        h.div(
          Editor(h, {}),
          h.output(model.join(",")),
          t.viewport(h.div).children(
            ...t.toasts.map((toast) =>
              t.root({ element: h.div.attr("data-testid", toast.id), toast }).children(toast.title)
            )
          )
        )
    })
})

// A page with a button that posts a new toast on each click.
const PosterMessage = UiSchema.TaggedEnum({ ClickedPost: {} })

const Poster = Component.define({ name: "Poster", model: Schema.Number, message: PosterMessage, elements: Html })
  .make({
    init: () => 0,
    update: (model, _message, $) =>
      $.set(model + 1).send(ToastProvider, { _tag: "AddedToast", toast: { id: "t" + (model + 1), title: "Toast" } }),
    view: (_, h) => h.button.attr("id", "post").onClick(PosterMessage.ClickedPost()).children("Post")
  })

const Page = Component.define({
  name: "Page",
  props: Schema.Struct({ timeout: Schema.Number }),
  model: Schema.Null,
  message: Schema.Never,
  elements: Html
}).make({
  init: () => null,
  update: (model) => model,
  view: (_, h) =>
    ToastProvider(h, {
      props: { timeout: h.props.timeout },
      view: (t) =>
        h.div(
          Poster(h, {}),
          t.viewport(h.div).children(
            ...t.toasts.map((toast) => t.root({ element: h.div.attr("id", toast.id), toast }).children(toast.title))
          )
        )
    })
})

/** Lets the render flush and the mounts run. */
const tick = Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, 30)))

const mountPage = Effect.fnUntraced(function*(timeout: number) {
  const container = yield* Effect.acquireRelease(
    Effect.sync(() => document.body.appendChild(document.createElement("div"))),
    (element) => Effect.sync(() => element.remove())
  )
  yield* Effect.flatMap(
    Scope.Scope,
    (scope) => Scope.provide(BrowserHost.mountEffect(Page, { timeout }, container), scope)
  )
  yield* tick
  return {
    byId: (id: string) => container.querySelector<HTMLElement>("#" + id),
    region: container.querySelector<HTMLElement>("[role=region]")!
  }
})

const press = (target: EventTarget, key: string) => {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })
  target.dispatchEvent(event)
  return event.defaultPrevented
}

describe("ToastProvider", { concurrent: false }, () => {
  it.effect("a toast posted from below closes after its timeout, which pauses in full while the pointer is on the stack", () =>
    Effect.gen(function*() {
      const wait = (millis: number) =>
        TestHost.settle.pipe(Effect.andThen(TestClock.adjust(`${millis} millis`)), Effect.andThen(TestHost.settle))
      const root = yield* TestHost.mount(App, {})
      const closing = () => root.get(toast("saved")).attrs?.["data-ending-style"] === ""
      const fire = (locator: Locator.Locator, event: string) => Locator.fire(root.get(locator), event)

      fire(toast("save"), "click")
      yield* wait(4999)
      assert.isFalse(closing())

      // Paused well past the timeout, then the whole timeout again.
      fire(viewport, "mouseenter")
      yield* wait(10000)
      assert.isFalse(closing())
      fire(viewport, "mouseleave")
      yield* wait(4999)
      assert.isFalse(closing())
      yield* wait(1)
      assert.isTrue(closing())
      assert.strictEqual(Locator.textOf(root.get(Locator.tag("output"))), "saved")
    }).pipe(Effect.provide(TestHost.layer())))

  it.effect("only timed toasts wait, and a window blur or keyboard focus in the stack pauses them all", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(ToastProvider, {}, standIn)
      s.expectMount(trackViewport(s))
      s.receive(post({ _tag: "AddedToast", toast: { id: "kept", timeout: 0 } }))
        .expectMount(trackToast(s, "kept"))
        .receive(post({ _tag: "AddedToast", toast: { id: "upload", type: "loading" } }))
        .expectMount(trackToast(s, "upload"))
        .receive(post({ _tag: "AddedToast", toast: { id: "short", timeout: 1000 } }))
        .expectMount(trackToast(s, "short"))
      assert.deepStrictEqual(waits(s), [{ id: "short", timeout: 1000 }])

      // The loading toast's result starts its timer.
      s.receive(post({ _tag: "UpdatedToast", id: "upload", type: "success" }))
      assert.deepStrictEqual(waits(s), [{ id: "short", timeout: 1000 }, { id: "upload", timeout: 5000 }])

      s.mounted(trackViewport(s), "BlurredWindow")
      assert.deepStrictEqual(waits(s), [])
      s.mounted(trackViewport(s), "FocusedWindow")
        .mounted(trackViewport(s), "FocusedViewport")
      assert.deepStrictEqual(waits(s), [])
      assert.strictEqual(s.get(viewport).attrs?.["data-expanded"], "")
      s.mounted(trackViewport(s), "BlurredViewport")
      assert.deepStrictEqual(waits(s), [{ id: "short", timeout: 1000 }, { id: "upload", timeout: 5000 }])

      // A timeout closes the toast, which leaves once its exit has run.
      s.resolve(s.current.pending[0]!.command, completed("short"))
        .emitted({ _tag: "Dismissed", id: "short" })
      assert.strictEqual(s.get(toast("short")).attrs?.["data-ending-style"], "")
      s.mounted(trackToast(s, "short"), { _tag: "Finished" })
      s.expect(toast("short")).toBeAbsent()
      // Closing a toast stops its timer.
      s.receive(post({ _tag: "ClosedToast", id: "upload" }))
      assert.deepStrictEqual(waits(s), [])
    }))

  it.effect("the close part and Escape dismiss a toast, while a toast the app closes emits nothing", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(ToastProvider, { timeout: 0 }, standIn)
      s.expectMount(trackViewport(s))
      for (const id of ["a", "b", "c"]) {
        s.receive(post({ _tag: "AddedToast", toast: { id } })).expectMount(trackToast(s, id))
      }
      s.fire(toast("a"), "keydown", { key: "Escape" }).emitted({ _tag: "Dismissed", id: "a" })
      // The collapsed stack hides Close, except while it has focus, as after
      // a press that was released outside the stack.
      assert.strictEqual(s.get(toast("close-b")).attrs?.["aria-hidden"], "true")
      s.fire(toast("close-b"), "focus")
      assert.isUndefined(s.get(toast("close-b")).attrs?.["aria-hidden"])
      s.fire(toast("close-b"), "blur")
      assert.strictEqual(s.get(toast("close-b")).attrs?.["aria-hidden"], "true")
      s.fire(toast("close-b"), "click").emitted({ _tag: "Dismissed", id: "b" })
      s.receive(post({ _tag: "ClosedToast", id: "c" }))
      assert.deepStrictEqual(s.current.emitted, [])
      s.expect(Locator.attr("data-ending-style")).toHaveCount(3)
      // Another key does nothing.
      s.fire(toast("c"), "keydown", { key: "Enter" }).expectIgnored()
    }))

  it.effect("the parts own their ARIA, data attributes and stacking variables over the consumer's", () =>
    Effect.gen(function*() {
      const s = yield* Scene.make(ToastProvider, { limit: 1, timeout: 0 }, {
        elements: Html,
        view: (t, h: View.Tags<Html.Elements, never>) =>
          t.viewport(h.div.attr("data-expanded", "").attr("style", "bottom:0")).children(
            ...t.toasts.map((toast) =>
              t.root({
                element: h.div.class("toast").attr("data-testid", toast.id).attr("role", "status")
                  .attr("data-limited", "").attr("style", "color:red;"),
                toast
              }).children(
                t.content({ element: h.div.attr("data-testid", "content-" + toast.id), toast }),
                t.title({ element: h.strong, toast }).children(toast.title)
              )
            )
          )
      })
      s.expectMount(trackViewport(s))
        .receive(post({ _tag: "AddedToast", toast: { id: "old", title: "Old", type: "info" } }))
        .expectMount(trackToast(s, "old"))
        .mounted(trackToast(s, "old"), { _tag: "Measured", height: 40 })
        .receive(post({ _tag: "AddedToast", toast: { id: "new", title: "New", description: "Now", priority: "high" } }))
        .expectMount(trackToast(s, "new"))

      const attrs = (locator: Locator.Locator) => s.get(locator).attrs ?? {}
      const old = attrs(toast("old"))
      assert.strictEqual(old.role, "dialog")
      assert.strictEqual(old.class, "toast")
      assert.strictEqual(old["data-type"], "info")
      assert.strictEqual(old["data-limited"], "")
      assert.strictEqual(old.inert, "")
      assert.isUndefined(old["data-starting-style"])
      assert.strictEqual(old.style, "color:red;--toast-index:1;--toast-offset-y:0px;--toast-height:40px")
      assert.strictEqual(attrs(Locator.attr("id", old["aria-labelledby"] as string)).id, old["aria-labelledby"])
      assert.isUndefined(old["aria-describedby"])
      assert.strictEqual(attrs(Locator.testId("content-old"))["data-behind"], "")

      // The new, high-priority toast: an alert dialog, announced by a copy.
      const fresh = attrs(toast("new"))
      assert.strictEqual(fresh.role, "alertdialog")
      assert.strictEqual(fresh["aria-hidden"], "true")
      assert.strictEqual(fresh["data-starting-style"], "")
      assert.isUndefined(fresh["data-limited"])
      assert.isUndefined(fresh["data-type"])
      assert.isString(fresh["aria-describedby"])
      assert.isUndefined(attrs(Locator.testId("content-new"))["data-behind"])
      assert.strictEqual(Locator.textOf(s.get(Locator.attr("role", "alert"))), "NewNow")

      const region = attrs(viewport)
      assert.strictEqual(region["aria-label"], "Notifications")
      assert.isUndefined(region["data-expanded"])
      assert.strictEqual(region.style, "bottom:0")

      // Closing the new toast frees the old one's place.
      s.receive(post({ _tag: "ClosedToast", id: "new" }))
      assert.isUndefined(attrs(toast("old"))["data-limited"])
      assert.isUndefined(attrs(toast("old")).inert)
      s.expect(Locator.attr("role", "alert")).toBeAbsent()
    }))

  it.effect("F6 moves focus into the stack and back, and focus on a closing toast moves to the next one", () =>
    Effect.gen(function*() {
      const { byId, region } = yield* mountPage(0)
      const post = byId("post")!
      post.focus()

      // No toast: F6 is the page's.
      assert.isFalse(press(post, "F6"))
      post.click()
      post.click()
      yield* tick

      assert.isTrue(press(post, "F6"))
      assert.strictEqual(document.activeElement, region)
      assert.isTrue(press(region, "F6"))
      assert.strictEqual(document.activeElement, post)

      // Newest first: t2, then t1.
      press(post, "F6")
      byId("t2")!.focus()
      press(byId("t2")!, "Escape")
      yield* tick
      assert.strictEqual(document.activeElement, byId("t1"))
      assert.isNull(byId("t2"))
      press(byId("t1")!, "Escape")
      yield* tick
      assert.strictEqual(document.activeElement, post)
      assert.isNull(byId("t1"))
    }))

  it.effect("closing the last focused toast never leaves focus on the empty stack, so later toasts time out", () =>
    Effect.gen(function*() {
      const { byId, region } = yield* mountPage(200)
      const post = byId("post")!

      // Tab from the button into the only toast, then Escape: focus goes back.
      post.focus()
      post.click()
      yield* tick
      byId("t1")!.focus()
      press(byId("t1")!, "Escape")
      yield* tick
      assert.strictEqual(document.activeElement, post)
      assert.isFalse(region.hasAttribute("data-expanded"))

      // Focus that came from nowhere leaves the stack for the page.
      post.blur()
      post.click()
      yield* tick
      byId("t2")!.focus()
      press(byId("t2")!, "Escape")
      yield* tick
      assert.strictEqual(document.activeElement, document.body)

      // A toast the app posts afterwards closes on its own.
      post.click()
      yield* tick
      assert.isNotNull(byId("t3"))
      yield* TestClock.adjust("200 millis")
      yield* tick
      assert.isNull(byId("t3"))
    }))
})
