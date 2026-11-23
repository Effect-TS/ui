import { HtmlLocator, HtmlPlay } from "@effect/ui/html/testing"
import { Locator, TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { FilePreview } from "./FilePreview.ts"

class EndlessFile extends File {
  cancelled = false
  override stream() {
    return new ReadableStream<Uint8Array<ArrayBuffer>>({
      cancel: () => {
        this.cancelled = true
      }
    })
  }
}

const chooser = HtmlLocator.label("Choose a file")

describe("FilePreview", () => {
  it.effect("choosing a file reads it and shows its line count and first lines", () =>
    Effect.gen(function*() {
      const play = yield* HtmlPlay.make(FilePreview, {})
      yield* play.change(chooser, { files: [new File(["one\ntwo\nthree"], "notes.txt")] })
      yield* play.expect(Locator.text("notes.txt: 3 lines")).toExist()
    }).pipe(Effect.scoped, Effect.provide(TestHost.layer())))

  it.effect("cancelling a read stops the browser reading the file", () =>
    Effect.gen(function*() {
      const play = yield* HtmlPlay.make(FilePreview, {})
      const file = new EndlessFile([], "huge.log")
      yield* play.change(chooser, { files: [file] })
      yield* play.expect(Locator.text("Reading huge.log…")).toExist()
      yield* play.click(HtmlLocator.role("button", { name: "Cancel" }))
      yield* play.expect(Locator.text("Cancelled reading huge.log.")).toExist()
      assert.isTrue(file.cancelled)
    }).pipe(Effect.scoped, Effect.provide(TestHost.layer())))
})
