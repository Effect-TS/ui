import { HtmlLocator, HtmlScene } from "@effect/ui/html/testing"
import { Locator } from "@effect/ui/testing"
import { describe, it } from "@effect/vitest"
import { Array, Effect } from "effect"
import { FAKE_FILES, UploadFile, Uploads } from "./Uploads.ts"

const firstFile = Array.headNonEmpty(FAKE_FILES)
const uploadFirst = UploadFile({ uploadId: 0, sizeMegabytes: firstFile.sizeMegabytes })

const uploadButton = HtmlLocator.role("button", { name: "Upload a file" })
const cancelAll = HtmlLocator.role("button", { name: "Cancel all" })

describe("Uploads", () => {
  it.effect("the initial view shows the start button and an empty state", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(Uploads, {})
      s.expect(HtmlLocator.role("heading", { name: "File Uploads" })).toExist()
        .expect(uploadButton).toExist()
        .expect(Locator.text("Nothing here yet. Start an upload.")).toExist()
    }))

  it.effect("starting an upload shows an Uploading row with a cancel button", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(Uploads, {})
      s.click(uploadButton)
        .expect(Locator.text(firstFile.name)).toExist()
        .expect(Locator.text("Uploading")).toExist()
        .expect(HtmlLocator.role("button", { name: "Cancel upload 0" })).toExist()
        .resolve(uploadFirst, undefined)
        .expect(Locator.text("Done")).toExist()
    }))

  it.effect("cancelling an upload marks it Cancelled and offers a restart", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(Uploads, {})
      s.click(uploadButton)
        .click(HtmlLocator.role("button", { name: "Cancel upload 0" }))
        .expect(Locator.text("Cancelled")).toExist()
        .expect(HtmlLocator.role("button", { name: "Restart upload 0" })).toExist()
        .click(HtmlLocator.role("button", { name: "Restart upload 0" }))
        .expect(Locator.text("Uploading")).toExist()
        .resolve(uploadFirst, undefined)
        .expect(Locator.text("Done")).toExist()
    }))

  it.effect("the cancel all button appears only while an upload is running", () =>
    Effect.gen(function*() {
      const s = yield* HtmlScene.make(Uploads, {})
      s.expect(cancelAll).toBeAbsent()
        .click(uploadButton)
        .expect(cancelAll).toExist()
        .click(cancelAll)
        .expect(cancelAll).toBeAbsent()
        .expect(Locator.text("Cancelled")).toExist()
    }))
})
