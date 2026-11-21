// @vitest-environment happy-dom
import { Component, UiSchema } from "@effect/ui"
import { Dialog, ToastProvider } from "@effect/ui-kit"
import { BrowserHost, Html } from "@effect/ui/html"
import { TestGlobalEvents } from "@effect/ui/html/testing"
import { Locator, TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer, Schema } from "effect"
import { TestClock } from "effect/testing"
import { popovers } from "./utils/document.ts"

// The first post is a loading toast; Complete turns it into a timed success.
const PosterMessage = UiSchema.TaggedEnum({ ClickedPost: {}, ClickedDrop: {}, CompletedUpload: {} })

const Poster = Component.define({ name: "Poster", model: Schema.Number, message: PosterMessage, elements: Html })
  .make({
    init: () => 0,
    update: {
      ClickedPost: (model, _message, $) =>
        $.set(model + 1).send(ToastProvider, {
          _tag: "AddedToast",
          toast: {
            id: "t" + (model + 1),
            title: "Toast",
            priority: model === 0 ? "high" : "low",
            type: model === 0 ? "loading" : "success"
          }
        }),
      CompletedUpload: (model, _message, $) =>
        $.set(model).send(ToastProvider, { _tag: "UpdatedToast", id: "t1", type: "success" }),
      ClickedDrop: (model, _message, $) => $.set(model).send(ToastProvider, { _tag: "ClosedToast", id: "t" + model })
    },
    view: (_, h) =>
      h.div(
        h.button.attr("id", "post").onClick(PosterMessage.ClickedPost()).children("Post"),
        h.button.attr("id", "complete").onClick(PosterMessage.CompletedUpload()).children("Complete"),
        h.button.attr("id", "drop").onClick(PosterMessage.ClickedDrop()).children("Drop")
      )
  })

const PageMessage = UiSchema.TaggedEnum({ Dismissed: { id: Schema.String } })

const Page = Component.define({
  name: "Page",
  props: Schema.Struct({ timeout: Schema.Number }),
  model: Schema.String,
  message: PageMessage,
  elements: Html
}).make({
  init: () => "",
  update: {
    Dismissed: (_, { id }) => id
  },
  view: (dismissed, h) =>
    ToastProvider(h, {
      props: { timeout: h.props.timeout, limit: 2 },
      onEmit: { Dismissed: ({ id }) => PageMessage.Dismissed({ id }) },
      view: (toastProvider) =>
        h.div(
          Poster(h, {}),
          h.output(dismissed),
          toastProvider.viewport(h.div).children(
            ...toastProvider.toasts.map((toast) =>
              toastProvider.root({ element: h.div.attr("id", toast.id), toast }).children(
                toast.title,
                toastProvider.close({ element: h.button.attr("id", "close-" + toast.id), toast }).children("Close")
              )
            )
          )
        )
    })
})

/** Lets the render flush and the mounts run. */
const tick = Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, 30)))

const mountPage = Effect.fnUntraced(function*(timeout: number) {
  yield* popovers
  const container = yield* Effect.acquireRelease(
    Effect.sync(() => document.body.appendChild(document.createElement("div"))),
    (element) => Effect.sync(() => element.remove())
  )
  yield* BrowserHost.mountEffect(Page, { timeout }, container)
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
  it.effect("a loading toast stays until completed, and hovering restarts the full dismissal timeout", () =>
    Effect.gen(function*() {
      const root = yield* TestHost.mount(Page, { timeout: 1000 })
      const fire = (id: string) => Locator.fire(root.get(Locator.attr("id", id)), "click")
      const dismissed = () => Locator.textOf(root.get(Locator.tag("output")))
      const wait = (millis: number) =>
        TestHost.settle.pipe(Effect.andThen(TestClock.adjust(`${millis} millis`)), Effect.andThen(TestHost.settle))

      fire("post")
      yield* wait(2000)
      assert.strictEqual(Locator.textOf(root.get(Locator.attr("role", "alert"))), "Toast")
      assert.strictEqual(dismissed(), "")
      fire("complete")
      yield* wait(999)
      const viewport = Locator.attr("role", "region")
      Locator.fire(root.get(viewport), "mouseenter")
      yield* wait(2000)
      assert.strictEqual(dismissed(), "")
      Locator.fire(root.get(viewport), "mouseleave")
      yield* wait(999)
      assert.strictEqual(dismissed(), "")
      yield* wait(1)
      assert.strictEqual(dismissed(), "t1")
    }).pipe(Effect.provide(TestHost.layer())))

  it.effect("the timers pause while the window doesn't have focus, and restart in full when it's back", () =>
    Effect.gen(function*() {
      const root = yield* TestHost.mount(Page, { timeout: 1000 })
      const fire = (id: string) => Locator.fire(root.get(Locator.attr("id", id)), "click")
      const dismissed = () => Locator.textOf(root.get(Locator.tag("output")))
      const wait = (millis: number) =>
        TestHost.settle.pipe(Effect.andThen(TestClock.adjust(`${millis} millis`)), Effect.andThen(TestHost.settle))

      fire("post")
      fire("complete")
      yield* wait(500)
      yield* TestGlobalEvents.fire("window", "blur")
      yield* wait(2000)
      assert.strictEqual(dismissed(), "")
      yield* TestGlobalEvents.fire("window", "focus")
      yield* wait(999)
      assert.strictEqual(dismissed(), "")
      yield* wait(1)
      assert.strictEqual(dismissed(), "t1")
    }).pipe(Effect.provide(Layer.merge(TestHost.layer(), TestGlobalEvents.layer))))

  it.effect("a collapsed stack exposes a focused Close and reports only user dismissals", () =>
    Effect.gen(function*() {
      const root = yield* TestHost.mount(Page, { timeout: 0 })
      const get = (id: string) => root.get(Locator.attr("id", id))
      const fire = (id: string, event: string) => Locator.fire(get(id), event)
      for (let i = 0; i < 3; i++) {
        fire("post", "click")
        yield* TestHost.settle
      }
      assert.strictEqual(get("t1").attrs?.inert, "")
      fire("drop", "click")
      yield* TestHost.settle
      assert.isUndefined(get("t1").attrs?.inert)
      assert.strictEqual(Locator.textOf(root.get(Locator.tag("output"))), "")
      const hidden = () => get("close-t2").attrs?.["aria-hidden"]
      assert.strictEqual(hidden(), "true")
      fire("close-t2", "focus")
      yield* TestHost.settle
      assert.isUndefined(hidden())
      fire("close-t2", "blur")
      yield* TestHost.settle
      assert.strictEqual(hidden(), "true")
      fire("close-t2", "click")
      yield* TestHost.settle
      assert.strictEqual(Locator.textOf(root.get(Locator.tag("output"))), "t2")
    }).pipe(Effect.provide(TestHost.layer())))

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

      // Focus that came from nowhere leaves the stack for the page.
      post.blur()
      post.click()
      yield* tick
      byId("t2")!.focus()
      press(byId("t2")!, "Escape")
      yield* tick
      assert.strictEqual(document.activeElement, document.body)

      // F6 focuses the viewport itself, then the app closes the only toast.
      post.focus()
      post.click()
      yield* tick
      press(post, "F6")
      assert.strictEqual(document.activeElement, region)
      yield* TestClock.adjust("200 millis")
      yield* tick
      assert.isNotNull(byId("t3"))
      byId("drop")!.click()
      yield* tick
      assert.strictEqual(document.activeElement, post)

      // A toast the app posts afterwards closes on its own.
      post.click()
      yield* tick
      assert.isNotNull(byId("t4"))
      yield* TestClock.adjust("200 millis")
      yield* tick
      assert.isNull(byId("t4"))
    }))
})

const AboveMessage = UiSchema.TaggedEnum({ Opened: {} })
const Above = Component.define({ name: "Above", model: Schema.Boolean, message: AboveMessage, elements: Html }).make({
  init: () => false,
  update: { Opened: () => true },
  view: (open, h) =>
    ToastProvider(h, {
      view: (toastProvider) =>
        h.div(
          h.button.attr("id", "open").onClick(AboveMessage.Opened()).children("Open"),
          toastProvider.viewport(h.div.attr("id", "toasts")),
          Dialog(h, {
            props: { open },
            view: (dialog) => h.div(dialog.portal(h.dialog)?.children(dialog.popup(h.div)))
          })
        )
    })
})

describe("ToastProvider above a dialog", { concurrent: false }, () => {
  it.effect("the viewport is a popover, shown again after a dialog opens", () =>
    Effect.gen(function*() {
      yield* popovers
      const shown: Array<string> = []
      const proto = window.HTMLElement.prototype as any
      const show = proto.showPopover
      proto.showPopover = function(this: HTMLElement) {
        shown.push(this.localName)
        return show.call(this)
      }
      const container = yield* Effect.acquireRelease(
        Effect.sync(() => document.body.appendChild(document.createElement("div"))),
        (element) => Effect.sync(() => element.remove())
      )
      yield* BrowserHost.mountEffect(Above, {}, container)
      yield* tick
      const viewport = container.querySelector<HTMLElement>("#toasts")!
      assert.strictEqual(viewport.getAttribute("popover"), "manual")
      assert.isTrue(viewport.matches(":popover-open"))
      shown.length = 0
      container.querySelector<HTMLElement>("#open")!.click()
      yield* tick
      assert.deepStrictEqual(shown, ["dialog", "div"])
    }))
})
