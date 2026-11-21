/**
 * @title Testing @effect/ui components
 *
 * Test a component's logic as a `Story`, its view as a `Scene`, a Command
 * against a fake Layer, and components working together as a `Play`. The
 * last test renders on the server and hydrates with `ssr`.
 */
// @vitest-environment happy-dom
import { Component, Router } from "@effect/ui"
import { HtmlLocator, HtmlPlay, HtmlScene, ssr } from "@effect/ui/html/testing"
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
// to what it tests: `notes/components/NoteEditor.story.test.ts` and
// `App.play.test.ts`.
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
// mode is `switch` or `queue`, or a stream, is meant to overlap the
// next message, so it doesn't block one. `keepPending` lets any other
// Command overlap on purpose. `make`'s end check fails on anything left.
// This is stricter than foldkit's stories: an ignored interaction and a query
// with no result count too.
//
// `make` is a scoped Effect: `const s = yield* Story.make(...)` gives the
// cursor, and `it.effect` from `@effect/vitest` provides the scope. Steps
// chain, and the test reads the Model or the view from the cursor between
// them. The end check runs when the scope closes, at the end of the test. It
// is skipped when the test already failed, so a failure reports only itself.
// `start` gives the same cursor with no end check: use it to assert that a
// step throws.

describe("NoteEditor", () => {
  it.effect("story: saves the draft and tells its parent", () =>
    Effect.gen(function*() {
      // Each step runs when called and throws on failure.
      const s = yield* Story.make(NoteEditor, { note })
      s.send(NoteEditorMessage.UpdatedBody({ body: edited.body }))
      assert.strictEqual(s.model.draft, edited.body)
      // Nothing runs in a story, so Subscriptions are asserted by key.
      assert.deepStrictEqual(s.subscriptions, ["autosave:1"])
      // Commands stay pending as data until a step resolves them. A
      // definition matches any args; `pending` holds them.
      s.send(NoteEditorMessage.RequestedSave()).expectExact(SaveNote)
      assert.deepStrictEqual(s.pending[0].command.args, { note: edited })
      // `resolve` takes the Command's own result. `fail` takes its typed error.
      s.resolve(SaveNote, edited)
      assert.strictEqual(s.model.saved, edited.body)
      // An event the component emitted is acknowledged by naming it.
      s.emitted(NoteEditorEvents.Saved({ note: edited }))
      // When the test ends, the end check fails if a Command is still
      // pending or an event isn't acknowledged.
    }))

  it.effect("scene: saves the draft and tells its parent", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(NoteEditor, { note })
      // `type` sends the `input` the browser host sends.
      s.type(body, edited.body)
        // A field's value is a property, not an attribute: `toHaveValue` reads it.
        .expect(body).toHaveValue(edited.body)
        // A submit button submits its form, with the fields read from the view.
        .click(HtmlLocator.role("button", { name: "Save" }))
        .expectExact(SaveNote)
        .expect(HtmlLocator.role("button", { name: "Saving…" })).toBeDisabled(false)
        .resolve(SaveNote, edited)
        .emitted(NoteEditorEvents.Saved({ note: edited }))
        .expect(HtmlLocator.role("button", { name: "Save" })).toBeDisabled()
    }))

  it.effect("scene: saves on Ctrl+S instead of opening the browser's save dialog", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(NoteEditor, { note })
      // `defaultPrevented` tells whether the last interaction cancelled the
      // browser's default. Reading it doesn't reset it.
      s.type(body, edited.body).keydown(body, "s", { ctrl: true })
      assert.isTrue(s.defaultPrevented)
      s.expectExact(SaveNote)
        .resolve(SaveNote, edited)
        .emitted(NoteEditorEvents.Saved({ note: edited }))
      // Any other step resets it.
      assert.isFalse(s.defaultPrevented)
    }))

  it.effect("scene: discards from the actions menu after asking, and Escape keeps the changes", () =>
    Effect.gen(function*() {
      const discard = HtmlLocator.role("dialog", { name: "Discard your changes?" })
      const actions = HtmlLocator.role("menu", { name: "Note actions" })
      const s = yield* HtmlScene.make(NoteEditor, { note })
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
        .expect(body).toHaveValue(note.body)
    }))

  it.effect("scene: shows why a save failed", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(NoteEditor, { note })
      s.type(body, edited.body)
        .submit(body)
        .fail(SaveNote, new NoteSaveError({ reason: "You are offline" }))
        .expect(HtmlLocator.role("alert")).toHaveText("You are offline")
    }))
})

describe("Collapsible", () => {
  it.effect("places what a parent passes, and hides the body", () =>
    Effect.gen(function*() {
      // `slots` stands in for a parent's content. Its `h` has no messages,
      // as the content's handlers would send the parent's.
      const s = yield* Scene.make(Collapsible, {}, {
        slots: (h) => ({ summary: h.h2("Groceries"), body: h.p("Milk") })
      })
      s.click("Hide")
        .expect(Locator.tag("h2")).toHaveText("Groceries")
        .expect(Locator.text("Milk")).toBeAbsent()
    }))
})

describe("NotePage", () => {
  it.effect("tells the editor to save now", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(NotePageNoDeps, { id: note.id })
      // Load steps take the query's name. `loaded` writes the `note`
      // query's result, as the runtime would, and re-renders.
      s.loaded("note", note)
        // The button is in the Collapsible's `summary` slot. A parent's
        // scene shows the content it passed to a child's slots, but not the
        // child's own view.
        .click("Save now")
        // A scene renders no children, so what `update` sent them is data,
        // acknowledged with the ref and the message.
        .sent(NoteEditor.ref("Editor").at(note.id), { _tag: "RequestedSave" })
    }))
})

describe("NotesIndex", () => {
  it.effect("pins a note dropped on the pinned list", () =>
    Effect.gen(function*() {
      const pinned = HtmlLocator.role("complementary", { name: "Pinned" })
      const s = yield* HtmlScene.make(NotesIndexNoDeps, {})
      // A drop with a hand-written payload goes to the target the browser
      // host would pick, and throws when none accepts the payload's types,
      // as the browser refuses the drop.
      s.loaded("notes", [note]).drop(pinned, { data: { "application/x-note": note.id } })
      assert.isTrue(s.defaultPrevented)
      s.expect(Locator.inside(pinned, Locator.tag("li"))).toHaveText(note.title)
      // A step that throws is asserted on a `start` cursor, which has no end check.
      const refused = HtmlScene.start(NotesIndexNoDeps, {}).loaded("notes", [note])
      assert.throws(() => refused.drop(pinned, { files: [new File(["hello"], "notes.txt")] }))
    }))
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
// Play: the runtime runs, with children, Layers and the Router real.
// ---------------------------------------------------------------------------

// A Play mounts on `TestHost` and drives the tree with the Scene's steps,
// while effects run against the Layers the test provides. Write one for how
// components work together: a child's real view, a Command's real
// implementation, a Subscription on the clock, the Router, a Layer. One
// component counts when its effects run. Write few: a Story or a Scene fails
// closer to the cause. In an app the file is `NoteEditor.play.test.ts`.
//
// Every step is an Effect: `yield*` each one, `expect` included. A step
// settles before it acts and again after, so it picks up a
// `TestClock.adjust` or a navigation on its own. An interaction no handler
// turned into a message still needs `expectIgnored()`. Nothing else needs
// acknowledging, since Layers and real components answer it. When the scope
// closes the Play settles once more, so a crash after the last step fails the
// test. `TestHost.layer()` provides the host. `TestHost.settle`, `setOnline`
// and `expectProblem` work beside the Play.

// `NoteEditor` already provides the app's Layers, and an inner provide wins
// over an outer one. So a test starts from `NoteEditorNoDeps` and provides
// its own: the real command over the in-memory `Notes`.
// Build fresh services for each test so edits cannot leak.
const NoteEditorTest = NoteEditorNoDeps.pipe(Component.provide(SaveNote.layer))

it.layer(Layer.mergeAll(Notes.layerMemory([note]), TestHost.layer()), { buildPerTest: true })(
  "NoteEditor as a Play",
  (it) => {
    it.effect("autosaves an edit", () =>
      Effect.gen(function*() {
        const notes = yield* Notes
        const play = yield* HtmlPlay.make(NoteEditorTest, { note })
        yield* play.type(body, edited.body)
        // The TestClock owns time. Adjusting it fires the autosave
        // Subscription, and the next step settles what that started.
        yield* TestClock.adjust("2 seconds")
        yield* play.expect(body).toHaveValue(edited.body)
        assert.deepStrictEqual(yield* notes.get(note.id), edited)
        assert.deepStrictEqual(play.root.emitted, [NoteEditorEvents.Saved({ note: edited })])
      }))
  }
)

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

it.layer(AppTest, { buildPerTest: true })("App as a Play", (it) => {
  it.effect("loads a note, saves an edit and shows the notice", () =>
    Effect.gen(function*() {
      // `Router.props` reads the root's `{ route }` from the Router.
      const play = yield* HtmlPlay.make(App, Router.props(AppRoute))
      // App's template around the title NotePage read from its query.
      assert.strictEqual(play.root.head().title, "Shopping · Notes")

      // NoteEditor's textarea, three components down.
      yield* play.type(body, edited.body)
      // NotePage's button, in Collapsible's summary slot. It sends
      // NoteEditor a save, NoteEditor runs SaveNote through the fake API and
      // emits Saved, and NotePage shows the notice.
      yield* play.click("Save now")
      yield* play.expect(HtmlLocator.role("status")).toHaveText("Saved")

      // Collapsible's own button.
      yield* play.click("Hide")
      yield* play.expect(body).toBeAbsent()
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

// ---------------------------------------------------------------------------
// The log as a timeline: what happened, and what the tree did about it.
// ---------------------------------------------------------------------------

// `root.log()` is every entry the runtime logged. An entry is one of two
// kinds. A fact reached the tree from outside it: a message from a DOM event,
// a Command's result, a Subscription or `root.send`, a query result, a Layer
// build or a Command run that ended. A consequence is what the tree did about
// a fact, and names it in `causedBy`: the messages its `update` sent on, the
// props, mounts and unmounts of its render, the runs it stopped, the fetches
// it started.
//
// `TestHost.formatTimeline` prints the facts in order, one per line, with
// each one's consequences indented under it. Print it when a test fails, or
// assert on it.
//
// A browser renders on its own clock, between whatever arrives. What an
// `update` is given doesn't depend on when: a message finds the props its
// ancestors' Models give its instance now, and an instance they no longer
// render takes none. `TestHost.layer({ flush })` moves the render among the
// test scheduler's tasks, so a test can check that its outcome holds
// wherever the render falls. Setting `EFFECT_UI_TEST_FLUSH` to `first`,
// `last` or a seed does it for a whole suite, with no change to its tests.
//
// A render still shows only the latest Model. A child is mounted with the
// props of the render that mounts it, and one shown and hidden again before
// a render is never mounted.
const timelineOf = (flush: TestHost.Flush) =>
  Effect.gen(function*() {
    const play = yield* HtmlPlay.make(App, Router.props(AppRoute))
    yield* play.type(body, edited.body)
    yield* TestClock.adjust("2 seconds")
    yield* play.expect(HtmlLocator.role("status")).toHaveText("Saved")
    const log = play.root.log()
    // Entry numbers follow the order entries were logged in, which a render
    // that ran earlier or later changes. Nothing else does.
    return { log, timeline: TestHost.formatTimeline(log).replace(/#\d+/g, "#") }
  }).pipe(
    Effect.scoped,
    Effect.provide(
      Layer.mergeAll(Router.memory({ routes: AppRoute, url: "/notes/n1" }), ApiFake, TestHost.layer({ flush }))
    )
  )

describe("the App's timeline", () => {
  it.effect("is the same whenever the render runs", () =>
    Effect.gen(function*() {
      const { timeline } = yield* timelineOf("queued")
      // The keystroke is a fact. What followed from it is listed under it.
      assert.match(timeline, /^# \S+ Update \S+ \(dom input\)/m)
      for (const flush of ["first", "last", { seed: 1 }, { seed: 2 }] as const) {
        assert.strictEqual((yield* timelineOf(flush)).timeline, timeline)
      }
    }))

  // `Story.fromLog` re-runs one instance's messages through its `update`,
  // with the props and query results the log gave it, and compares the Model,
  // Commands and events with what was logged. Here it does so for every
  // instance the session mounted.
  it.effect("replays, instance by instance", () =>
    Effect.gen(function*() {
      const { log } = yield* timelineOf("last")
      const mounted = log.filter((entry) => entry._tag === "Mounted")
      assert.isAbove(mounted.length, 3)
      for (const entry of mounted) {
        const replay = Story.fromLog(
          entry.component as Component.Component<any, any, any, any, any, any, any, any, any>,
          log,
          {
            path: entry.path
          }
        )
        assert.isUndefined(replay.divergence, entry.path)
      }
    }))
})
