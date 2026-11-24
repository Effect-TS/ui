---
"@effect/ui": minor
---

Component tests are split in two. `Story` tests the model: it sends messages, settles Commands and queries, and asserts on the Model, with no view surface. `Scene` tests the view: it clicks, fires events and asserts on what the view shows, and has no `send` and no Model. Both share the steps in `Steps`, and `Story.head` takes a scene's record too.

`Story.make`, `Scene.make` and `HtmlScene.make` return a scoped Effect that yields the cursor, instead of taking a callback, so a test is a list of statements:

```ts
it.effect("saves the draft and tells its parent", () =>
  Effect.gen(function*() {
    const story = yield* Story.make(NoteEditor, { note })
    story.send(NoteEditorMessage.Edited({ body: edited.body }))
    assert.strictEqual(story.model.draft, edited.body)
    story.send(NoteEditorMessage.Save())
    story.expectExact([SaveNote])
    story.resolve(SaveNote, edited)
    assert.strictEqual(story.model.saved, edited.body)
    story.emitted([NoteEditorEvents.Saved({ note: edited })])
  }))
```

The end check runs when the scope closes with a success; `it.effect` from `@effect/vitest` provides the scope. When the test has already failed, the end check doesn't run, so the test reports only its own failure. The cursor exposes the record's fields directly (`model`, `pending`, `subscriptions`, `queryInfo`, a story's `results` and `queries`, and a scene's `view`, `root`, `get`, `query` and `all`), so tests use plain assertions. `Story.model(f)`, `Scene.view(f)`, `subscriptions(f)` and `queryInfo(f)` are removed; `check(f)` stays for checks inside a chain. `emitted`, `sent` and `props` stay steps, so those record fields are read from `current`. `start` still returns a plain cursor with no end check, for tests that assert a step throws.

`HtmlScene` replaces `HtmlStory`. Its `click` runs the browser's defaults: a disabled control throws, a submit button submits its form with the fields read from the view, a checkbox or radio fires `input` and `change`, and a `popovertarget` button fires `toggle`. It adds `type`, `change`, `keydown`, `submit`, `focus`, `blur` and `drop` steps, and `toHaveValue`, `toBeChecked`, `toBeDisabled` and `toHaveAccessibleName` matchers. `HtmlLocator` adds the `label` and `placeholder` locators, renames `input` to `type` and `keyDown` to `keydown`.

Stories and scenes now follow one rule: every outcome of a step is acknowledged before the test moves on. A message step (`receive`, `subscription`, `layerFailed`, a story's `send`, a scene's interactions and child steps) throws while a Command or a load more is pending, while an enabled query has no result, or while a mount a scene's view started is unnamed. Commands in `switch` or `queue` mode, stream Commands, and anything marked with `keepPending` don't block it. Every acting step throws on events not acknowledged with `emitted`, messages not acknowledged with `sent`, and an ignored interaction not acknowledged with `expectIgnored`. The end check fails on anything still pending, kept or exempt included, and on anything unacknowledged. `given` after an acting step throws rather than discard work, a query with no result that it would disable included. `emitted` and `sent` take the values they acknowledge.

In a scene, a mount the view starts is in flight until `mounted` ends it or `expectMount` names it, and a step that removes it before then throws. A mount from `Mount.make` ends once; one from `Mount.makeStream` takes a value per `mounted`. After `given`, the mounts in the view are new.
