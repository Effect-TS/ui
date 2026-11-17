/**
 * @title Testing @effect/ui components
 *
 * Test a component's logic as a `Story` and its view as a `Scene`, a Command
 * against a fake Layer, and a whole tree on `TestHost`. The last test renders on the server and hydrates
 * with `ssr`.
 */
// @vitest-environment happy-dom
import { Component, Router } from "@effect/ui"
import { HtmlLocator, HtmlScene, ssr } from "@effect/ui/html/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { HttpClient, HttpClientResponse } from "effect/http"
import { TestClock } from "effect/testing"
// Tests render views, so they register the HTML elements too. An app with
// many test files does it once, in a Vitest setup file.
// oxlint-disable-next-line no-unassigned-import
import "@effect/ui/html/register"
import { Locator, Scene, Story, TestHost } from "@effect/ui/testing"
// One file here, to read top to bottom. In an app each `describe` sits next
// to what it tests: `notes/components/NoteEditor.test.ts` and `App.test.ts`.
import { App } from "./fixtures/App.ts"
import { Collapsible } from "./fixtures/kit/Collapsible.ts"
import {
  NoteEditor,
  NoteEditorEvents,
  NoteEditorMessage,
  NoteEditorNoDeps,
  SaveNote
} from "./fixtures/notes/components/NoteEditor.ts"
import { type Note, NoteSaveError } from "./fixtures/notes/domain/Note.ts"
import { Notes } from "./fixtures/notes/services/Notes.ts"
import { NotePageNoDeps } from "./fixtures/pages/notes/NotePage.ts"
import { NotesIndexNoDeps } from "./fixtures/pages/NotesIndex.ts"
import { AppRoute } from "./fixtures/routes.ts"

const note: Note = { id: "n1", title: "Shopping", body: "Milk" }
const edited: Note = { ...note, body: "Oat milk" }

const body = HtmlLocator.role("textbox", { name: "Body" })

// ---------------------------------------------------------------------------
// Story and Scene: one instance as pure functions. No runtime, Layers or host.
// ---------------------------------------------------------------------------

// A Story drives `update`: it sends messages and checks the Model. A Scene
// drives the view: it clicks and types as a user does and checks what the
// view shows, with no Model to read. Test logic with a Story: what a message
// does to the Model, and which Commands it runs. Test what a user sees and
// does with a Scene. In an app each kind gets its own file, next to the
// component: `NoteEditor.story.test.ts` and `NoteEditor.scene.test.ts`.
//
// Both follow one rule: every effect a step causes is accounted for before
// the test moves on. A message step (`send`, `receive`, a click) throws
// while a Command it could race is still running, a query has no result, or
// an event, send or ignored click hasn't been acknowledged. A Command whose
// mode is `switch`, `drop` or `queue`, or a stream, is meant to overlap the
// next message, so it doesn't block one. `keepPending` lets any other
// Command overlap on purpose. The end of `make` throws on anything left. This
// is stricter than foldkit's stories: an ignored interaction and a query
// with no result count too.

describe("NoteEditor", () => {
  it("story: saves the draft and tells its parent", () => {
    // Each step runs when called and throws on failure.
    Story.make(NoteEditor, { note }, (s) =>
      s.send(NoteEditorMessage.make({ _tag: "Edited", body: edited.body }))
        .model((model) => assert.strictEqual(model.draft, edited.body))
        // Nothing runs in a story, so Subscriptions are asserted by key.
        .subscriptions((keys) => assert.deepStrictEqual(keys, ["autosave:1"]))
        .send(NoteEditorMessage.make({ _tag: "Save" }))
        // Commands stay pending as data until a step resolves them. A
        // definition matches any args; `check` reads them.
        .expectExact(SaveNote)
        .check((story) => assert.deepStrictEqual(story.pending[0].command.args, { note: edited }))
        // `resolve` takes the Command's own result. `fail` takes its typed error.
        .resolve(SaveNote, edited)
        .model((model) => assert.strictEqual(model.saved, edited.body))
        // An event the component emitted is acknowledged by naming it.
        .emitted(NoteEditorEvents.make({ _tag: "Saved", note: edited })))
    // `Story.make` throws if a Command is still pending at the end, or an
    // event isn't acknowledged.
  })

  it("scene: saves the draft and tells its parent", () => {
    HtmlScene.make(NoteEditor, { note }, (s) =>
      // `type` sends the `input` the browser host sends.
      s.type(body, edited.body)
        // A field's value is a property, not an attribute: `toHaveValue` reads it.
        .expect(body).toHaveValue(edited.body)
        // A submit button submits its form, with the fields read from the view.
        .click(HtmlLocator.role("button", { name: "Save" }))
        .expectExact(SaveNote)
        .expect(HtmlLocator.role("button", { name: "Saving…" })).toBeDisabled(false)
        .resolve(SaveNote, edited)
        .emitted(NoteEditorEvents.make({ _tag: "Saved", note: edited }))
        .expect(HtmlLocator.role("button", { name: "Save" })).toBeDisabled())
  })

  it("scene: saves on Ctrl+S instead of opening the browser's save dialog", () => {
    HtmlScene.make(NoteEditor, { note }, (s) =>
      s.type(body, edited.body)
        // `defaultPrevented` tells whether the last interaction cancelled
        // the browser's default. Checks read it without resetting it.
        .keydown(body, "s", { ctrl: true })
        .check((scene) => assert.isTrue(scene.defaultPrevented))
        .expectExact(SaveNote)
        .resolve(SaveNote, edited)
        .emitted(NoteEditorEvents.make({ _tag: "Saved", note: edited }))
        // Any other step resets it.
        .check((scene) => assert.isFalse(scene.defaultPrevented)))
  })

  it("scene: discards from the actions menu after asking, and Escape keeps the changes", () => {
    const discard = HtmlLocator.role("dialog", { name: "Discard your changes?" })
    const actions = HtmlLocator.role("menu", { name: "Note actions" })
    HtmlScene.make(NoteEditor, { note }, (s) =>
      s.type(body, edited.body)
        // The menu's button is a `popovertarget` invoker: the click sends the
        // menu the `toggle` the browser would.
        .click("More actions")
        .expect(actions).toExist()
        .click("Discard changes")
        // Choosing an item closes the menu. A closed popover or dialog is
        // hidden from role queries, as it is from the accessibility tree.
        .expect(actions).toBeAbsent()
        .expect(discard).toExist()
        // Escape is a close request, sent to `onCancel`. Here `update` closes
        // the dialog and keeps the draft.
        .fire(discard, "cancel")
        .expect(discard).toBeAbsent()
        .expect(body).toHaveValue(edited.body)
        .click("More actions")
        .click("Discard changes")
        // The dialog's form is the app's: the button's name and value are in `entries`.
        .click(HtmlLocator.role("button", { name: "Discard" }))
        .expect(body).toHaveValue(note.body))
  })

  it("scene: shows why a save failed", () => {
    HtmlScene.make(NoteEditor, { note }, (s) =>
      s.type(body, edited.body)
        .submit(body)
        .fail(SaveNote, new NoteSaveError({ reason: "You are offline" }))
        .expect(HtmlLocator.role("alert")).toHaveText("You are offline"))
  })
})

describe("Collapsible", () => {
  it("places what a parent passes, and hides the body", () => {
    // `slots` stands in for a parent's content. Its `h` has no messages,
    // as the content's handlers would send the parent's.
    Scene.make(
      Collapsible,
      {},
      { slots: (h) => ({ summary: h.h2("Groceries"), body: h.p("Milk") }) },
      (s) =>
        s.click("Hide")
          .expect(Locator.tag("h2")).toHaveText("Groceries")
          .expect(Locator.text("Milk")).toBeAbsent()
    )
  })
})

describe("NotePage", () => {
  it("tells the editor to save now", () => {
    HtmlScene.make(NotePageNoDeps, { id: note.id }, (s) =>
      // Load steps take the query's name. `loaded` writes the `note`
      // query's result, as the runtime would, and re-renders.
      s.loaded("note", note)
        // The button is in the Collapsible's `summary` slot. A parent's
        // scene shows the content it passed to a child's slots, but not the
        // child's own view.
        .click("Save now")
        // A scene renders no children, so what `update` sent them is data,
        // acknowledged with the ref and the message.
        .sent(NoteEditor.ref("Editor").at(note.id), { _tag: "Save" }))
  })
})

describe("NotesIndex", () => {
  it("pins a note dropped on the pinned list", () => {
    const pinned = HtmlLocator.role("complementary", { name: "Pinned" })
    HtmlScene.make(NotesIndexNoDeps, {}, (s) =>
      s.loaded("notes", [note])
        // A drop with a hand-written payload goes to the target the browser
        // host would pick, and throws when none accepts the payload's types,
        // as the browser refuses the drop.
        .drop(pinned, { data: { "application/x-note": note.id } })
        .check((scene) => assert.isTrue(scene.defaultPrevented))
        .expect(Locator.inside(pinned, Locator.tag("li"))).toHaveText(note.title))
    assert.throws(() =>
      HtmlScene.start(NotesIndexNoDeps, {}).loaded("notes", [note])
        .drop(pinned, { files: [new File(["hello"], "notes.txt")] })
    )
  })
})

// ---------------------------------------------------------------------------
// Command: its implementation against a fake of the service it captures.
// ---------------------------------------------------------------------------

it.layer(SaveNote.layer.pipe(Layer.provideMerge(Notes.layerMemory([note]))), { buildPerTest: true })(
  "SaveNote",
  (it) => {
    it.effect("writes through Notes, and fails with a typed error", () =>
      Effect.gen(function*() {
        const notes = yield* Notes
        // `.effect` is the Command's work, before any `Command.match`.
        assert.deepStrictEqual(yield* SaveNote.make({ note: edited }).effect, edited)
        assert.deepStrictEqual(yield* notes.get(note.id), edited)

        const error = yield* Effect.flip(SaveNote.make({ note: { ...note, title: "" } }).effect)
        assert.strictEqual(error._tag, "NoteSaveError")
      }))
  }
)

// ---------------------------------------------------------------------------
// Runtime: one component on `TestHost`, with the Layers the test picks.
// ---------------------------------------------------------------------------

// `NoteEditor` already provides the app's Layers, and an inner provide wins
// over an outer one. So a test starts from `NoteEditorNoDeps` and provides
// its own: the real command over the in-memory `Notes`.
// Build fresh services for each test so edits cannot leak.
const NoteEditorTest = NoteEditorNoDeps.pipe(Component.provide(SaveNote.layer))

it.layer(Layer.mergeAll(Notes.layerMemory([note]), TestHost.layer()), { buildPerTest: true })(
  "NoteEditor on TestHost",
  (it) => {
    it.effect("autosaves an edit", () =>
      Effect.gen(function*() {
        const notes = yield* Notes
        const root = yield* TestHost.mount(NoteEditorTest, { note })
        Locator.fire(root.get(body), "input", { value: edited.body })
        // `settle` drains Commands, fetches, Layer builds and the render flush.
        yield* TestHost.settle
        // The TestClock owns time. Adjusting it fires the autosave Subscription.
        yield* TestClock.adjust("2 seconds")
        yield* TestHost.settle
        assert.deepStrictEqual(yield* notes.get(note.id), edited)
        assert.deepStrictEqual(root.emitted, [NoteEditorEvents.make({ _tag: "Saved", note: edited })])
      }))
  }
)

// ---------------------------------------------------------------------------
// Runtime: the whole app, across children, Layers and the Router.
// ---------------------------------------------------------------------------

// The app is tested as it ships, so its components keep their own domain
// Layers. The test provides what an entry module provides. `Router.memory`
// is the Router for tests, and the HTTP client is a fake of the notes API.
const ApiFake = Layer.sync(HttpClient.HttpClient, () => {
  const notes = new Map([[note.id, note]])
  return HttpClient.make((request, url) =>
    Effect.sync(() => {
      const id = url.pathname.slice("/api/notes/".length)
      if (request.method === "PUT" && request.body._tag === "Uint8Array") {
        notes.set(id, JSON.parse(new TextDecoder().decode(request.body.body)))
      }
      const found = id === "" ? Array.from(notes.values()) : notes.get(id)
      return HttpClientResponse.fromWeb(
        request,
        found === undefined ? new Response(null, { status: 404 }) : Response.json(found)
      )
    })
  )
})

const AppTest = Layer.mergeAll(
  Router.memory({ routes: AppRoute, url: "/notes/n1" }),
  ApiFake,
  TestHost.layer()
)

it.layer(AppTest, { buildPerTest: true })("App", (it) => {
  it.effect("loads a note, saves an edit and shows the notice", () =>
    Effect.gen(function*() {
      // `Router.props` reads the root's `{ route }` from the Router.
      const root = yield* TestHost.mount(App, Router.props(AppRoute))
      yield* TestHost.settle
      assert.strictEqual(root.head().title, "Shopping · Notes")

      Locator.fire(root.get(body), "input", { value: edited.body })
      yield* TestHost.settle
      yield* TestClock.adjust("2 seconds")
      yield* TestHost.settle
      assert.strictEqual(Locator.textOf(root.get(HtmlLocator.role("status"))), "Saved")
    }))

  it.effect("hydrates what the server rendered", () =>
    Effect.gen(function*() {
      // `ssr` renders on the server and hydrates in a fresh document, which
      // is why this file needs the DOM environment above. It fails with
      // `SsrError` if the two disagree.
      const result = yield* ssr(App, Router.props(AppRoute))
      assert.include(result.html, "Milk")
      // The paths of the instances that adopted the server's state.
      // The editor sits in the Collapsible's `body` slot, under its path.
      assert.include(result.adopted, "/App/NotePage[/notes/n1]/Collapsible[note]/[body]/NoteEditor[Editor[n1]]")
    }))
})
