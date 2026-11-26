import { type Component, UiSchema, View } from "@effect/ui"
import { Field, FileDrop, type FileDropProps } from "@effect/ui-kit"
import { Html, HtmlFiles } from "@effect/ui/html"
import {
  HtmlLocator,
  HtmlPlay,
  HtmlScene,
  TestFiles
} from "@effect/ui/html/testing"
import { Locator, Story, TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer, Schema } from "effect"

const standIn = {
  elements: Html,
  view: (
    fileDrop: Component.Headless.Parts<typeof FileDrop>,
    h: View.Helper<never, FileDropProps> & View.Tags<Html.Elements, never>
  ) =>
    fileDrop.root(h.div.attr("data-testid", "zone")).children(
      h.span(fileDrop.dragOver ? "Release to drop" : "Drop files"),
      fileDrop.trigger(h.button).children("Choose files")
    )
}

const zone = Locator.attr("data-testid", "zone")
const trigger = Locator.tag("button")
const h = View.makeHelper<never, {}, Html.Elements>({}, Html)

const file = (name: string, type = "") => new File([name], name, { type })

describe("FileDrop", () => {
  it.effect("dragenter sets data-drag-over and dragOver, dragleave and drop clear them, and disabling mid-drag clears on leave", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(FileDrop, {}, standIn)
      assert.isUndefined(scene.get(zone).attrs?.["data-drag-over"])
      scene.expect(Locator.text("Drop files")).toExist()

      scene.fire(zone, "dragenter")
      assert.strictEqual(scene.get(zone).attrs?.["data-drag-over"], "")
      scene.expect(Locator.text("Release to drop")).toExist()

      scene.fire(zone, "dragleave")
      assert.isUndefined(scene.get(zone).attrs?.["data-drag-over"])
      scene.expect(Locator.text("Drop files")).toExist()

      const photo = file("photo.png", "image/png")
      scene.fire(zone, "dragenter")
        .drop(zone, { files: [photo] })
        .emitted({ _tag: "Picked", files: [photo] })
      assert.isUndefined(scene.get(zone).attrs?.["data-drag-over"])

      // Disabling while a drag is over hides data-drag-over, and a leave
      // while disabled clears it so re-enabling doesn't restore stale state.
      scene.fire(zone, "dragenter")
        .props({ disabled: true })
      assert.isUndefined(scene.get(zone).attrs?.["data-drag-over"])
      scene.fire(zone, "dragleave")
        .props({ disabled: false })
      assert.isUndefined(scene.get(zone).attrs?.["data-drag-over"])
    }))

  it.effect("classifies dropped files by multiple and accept, emitting Picked before Rejected on mixed batches", () =>
    Effect.gen(function*() {
      const png = file("photo.png", "image/png")
      const json = file("DATA.JSON", "")
      const txt = file("notes.txt", "text/plain;charset=utf-8")
      const pdf = file("report.pdf", "application/pdf")

      // Single-file mode rejects the whole raw batch before type filtering.
      const single = yield* HtmlScene.make(
        FileDrop,
        { accept: ["image/*"] },
        standIn
      )
      single.drop(zone, { files: [png, pdf] })
        .emitted({
          _tag: "Rejected",
          files: [png, pdf],
          reason: "too-many-files"
        })

      // Multi-file mode splits mixed batches: Picked first, then Rejected.
      const multi = yield* HtmlScene.make(
        FileDrop,
        { multiple: true, accept: ["image/*", ".json"] },
        standIn
      )
      multi.drop(zone, { files: [png, json, txt, pdf] })
        .emitted(
          { _tag: "Picked", files: [png, json] },
          { _tag: "Rejected", files: [txt, pdf], reason: "invalid-type" }
        )

      // Exact MIME strips parameters, and */* allows any file.
      multi.props({ multiple: true, accept: ["text/plain"] })
        .drop(zone, { files: [txt, pdf] })
        .emitted(
          { _tag: "Picked", files: [txt] },
          { _tag: "Rejected", files: [pdf], reason: "invalid-type" }
        )

      multi.props({ multiple: true, accept: ["*/*"] })
        .drop(zone, { files: [json, pdf] })
        .emitted({ _tag: "Picked", files: [json, pdf] })
    }))

  it.effect("trigger opens HtmlFiles.Pick with accept and multiple and classifies picked files the same way", () =>
    Effect.gen(function*() {
      const png = file("photo.png", "image/png")
      const pdf = file("report.pdf", "application/pdf")
      const scene = yield* HtmlScene.make(
        FileDrop,
        { accept: ["image/*"], multiple: true },
        standIn
      )

      // Dismissed and unopened pickers emit nothing.
      scene.click(trigger)
        .expectExact(
          HtmlFiles.Pick.make({ accept: ["image/*"], multiple: true })
        )
        .resolve(HtmlFiles.Pick, { opened: true, files: [] })
      assert.deepStrictEqual(scene.current.emitted, [])

      scene.click(trigger)
        .resolve(HtmlFiles.Pick, { opened: false, files: [] })
      assert.deepStrictEqual(scene.current.emitted, [])

      // Mixed picked batch emits Picked then Rejected.
      scene.click(trigger)
        .resolve(HtmlFiles.Pick, { opened: true, files: [png, pdf] })
        .emitted(
          { _tag: "Picked", files: [png] },
          { _tag: "Rejected", files: [pdf], reason: "invalid-type" }
        )

      // Single-file mode rejects multiple picked files as too-many-files.
      scene.props({ accept: ["image/*"], multiple: false })
        .click(trigger)
        .expectExact(
          HtmlFiles.Pick.make({ accept: ["image/*"], multiple: false })
        )
        .resolve(HtmlFiles.Pick, { opened: true, files: [png, pdf] })
        .emitted({
          _tag: "Rejected",
          files: [png, pdf],
          reason: "too-many-files"
        })
    }))

  it.effect("disabled sets data-disabled and native disabled on trigger, and ignores drags and drops", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(
        FileDrop,
        { disabled: true },
        standIn
      )
      assert.strictEqual(scene.get(zone).attrs?.["data-disabled"], "")
      assert.strictEqual(scene.get(trigger).attrs?.["data-disabled"], "")
      scene.expect(trigger).toBeDisabled()

      scene.fire(zone, "dragenter")
        .drop(zone, { files: [file("photo.png", "image/png")] })
      assert.isUndefined(scene.get(zone).attrs?.["data-drag-over"])
      assert.deepStrictEqual(scene.current.emitted, [])
    }))

  it("root accepts any element, trigger takes only button, and own attributes win over consumer attributes", () => {
    const enabled = Story.parts(FileDrop, {
      model: { dragOver: false },
      props: {}
    })
    assert.strictEqual(enabled.dragOver, false)
    assert.strictEqual(enabled.disabled, false)
    assert.strictEqual(View.build(enabled.root(h.section), []).tag, "section")
    assert.strictEqual(
      View.build(enabled.root(enabled.trigger(h.button)), []).tag,
      "button"
    )
    assert.throws(
      () => enabled.trigger(h.div as any),
      /a part for <button> was given <div>/
    )

    assert.deepStrictEqual(
      View.build(
        enabled.root(
          h.div.class("dropzone").attrs({
            "aria-label": "Attachments",
            "data-drag-over": "",
            "data-disabled": ""
          })
        ),
        []
      ).attrs,
      { class: "dropzone", "aria-label": "Attachments" }
    )
    assert.deepStrictEqual(
      View.build(
        enabled.trigger(
          h.button.class("pick").attrs({
            type: "submit",
            "aria-disabled": "true",
            "data-disabled": ""
          }).disabled(true)
        ),
        []
      ).attrs,
      { class: "pick", type: "button" }
    )

    const dragging = Story.parts(FileDrop, {
      model: { dragOver: true },
      props: {}
    })
    assert.strictEqual(dragging.dragOver, true)
    assert.strictEqual(
      View.build(dragging.root(h.div), []).attrs["data-drag-over"],
      ""
    )
  })

  it.effect("composes with Field and works end-to-end with HtmlPlay.drop and TestFiles", () =>
    Effect.gen(function*() {
      const Msg = UiSchema.TaggedEnum({
        Picked: { names: Schema.Array(Schema.String) },
        Rejected: { reason: Schema.String }
      })
      const Upload = Html.component({
        name: "Upload",
        model: Schema.Struct({
          names: Schema.Array(Schema.String),
          error: Schema.NullOr(Schema.String)
        }),
        message: Msg
      }).make({
        init: () => ({ names: [], error: null }),
        update: {
          Picked: ($, { names }) => ({
            names: [...$.model.names, ...names],
            error: null
          }),
          Rejected: ($, { reason }) => $.evolve({ error: reason })
        },
        view: (h, model) =>
          Field(h, {
            props: { invalid: model.error !== null },
            view: (field) =>
              FileDrop(h, {
                props: {
                  accept: ["image/*"],
                  multiple: true,
                  disabled: field.disabled
                },
                onEmit: {
                  Picked: ({ files }) =>
                    Msg.Picked({ names: files.map((f) => f.name) }),
                  Rejected: ({ reason }) => Msg.Rejected({ reason })
                },
                view: (fileDrop) =>
                  field.root(h.div).children(
                    field.label(h.label).children("Attachment"),
                    fileDrop.root(h.div.attr("data-testid", "dropzone"))
                      .children(
                        fileDrop.trigger(field.control(h.button)).children(
                          "Choose file"
                        )
                      ),
                    field.error(h.div)?.children(model.error ?? ""),
                    h.p.attr("data-testid", "names").children(
                      model.names.join(",")
                    )
                  )
              })
          })
      })

      const play = yield* HtmlPlay.make(Upload, {})
      const control = HtmlLocator.label("Attachment")
      yield* play.expect(control).toExist()

      // Drop a mixed batch: accepted file stored, error set on invalid field.
      yield* play.drop(Locator.attr("data-testid", "dropzone"), {
        files: [
          file("a.png", "image/png"),
          file("bad.txt", "text/plain")
        ]
      })
      yield* play.expect(Locator.attr("data-testid", "names")).toHaveText(
        "a.png"
      )
      assert.strictEqual(play.root.get(control).attrs?.["aria-invalid"], "true")

      // Pick a valid file via TestFiles: clears error and appends file.
      yield* play.click(control)
      yield* TestFiles.choose([file("b.png", "image/png")])
      yield* TestHost.settle
      yield* play.expect(Locator.attr("data-testid", "names")).toHaveText(
        "a.png,b.png"
      )
      assert.isUndefined(play.root.get(control).attrs?.["aria-invalid"])
    }).pipe(
      Effect.provide(Layer.merge(TestHost.layer(), TestFiles.layer)),
      Effect.scoped
    ))
})
