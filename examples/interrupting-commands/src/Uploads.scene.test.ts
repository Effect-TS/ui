import { HtmlLocator, HtmlScene } from "@effect/ui/html/testing"
import { Locator } from "@effect/ui/testing"
import { describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { FAKE_FILES, UploadFile, Uploads, UploadsMessage } from "./Uploads.ts"

const [firstFile] = FAKE_FILES
const completedFirst = UploadsMessage.CompletedUploadFile({ uploadId: 0 })

const uploadButton = HtmlLocator.role("button", { name: "Upload a file" })
const cancelFirst = HtmlLocator.role("button", { name: "Cancel upload 0" })
const restartFirst = HtmlLocator.role("button", { name: "Restart upload 0" })
const cancelAll = HtmlLocator.role("button", { name: "Cancel all" })

describe("Uploads", () => {
  it.effect("the initial view shows the start button and an empty state", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(Uploads, {})
      scene.expect(HtmlLocator.role("heading", { name: "File Uploads" }))
        .toExist()
        .expect(uploadButton).toExist()
        .expect(Locator.text("Nothing here yet. Start an upload.")).toExist()
    }))

  it.effect("starting an upload shows an Uploading row with a cancel button", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(Uploads, {})
      scene.click(uploadButton)
        .expect(Locator.text(firstFile.name)).toExist()
        .expect(Locator.text("Uploading")).toExist()
        .expect(cancelFirst).toExist()
        .resolve(UploadFile, completedFirst)
        .expect(Locator.text("Done")).toExist()
    }))

  it.effect("cancelling an upload marks it Cancelled and offers a restart", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(Uploads, {})
      scene.click(uploadButton)
        .click(cancelFirst)
        .expect(Locator.text("Cancelled")).toExist()
        .click(restartFirst)
        .expect(Locator.text("Uploading")).toExist()
        .resolve(UploadFile, completedFirst)
        .expect(Locator.text("Done")).toExist()
    }))

  it.effect("the cancel all button appears only while an upload is running", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(Uploads, {})
      scene.expect(cancelAll).toBeAbsent()
        .click(uploadButton)
        .click(cancelAll)
        .expect(cancelAll).toBeAbsent()
        .expect(Locator.text("Cancelled")).toExist()
    }))
})
