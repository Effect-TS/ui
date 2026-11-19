import { Story } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { FAKE_FILES, UploadFile, Uploads, UploadsMessage, type UploadsModel } from "./Uploads.ts"

const [firstFile, secondFile, thirdFile] = FAKE_FILES

const uploadFirst = UploadFile.make({ uploadId: 0, sizeMegabytes: firstFile.sizeMegabytes })
const uploadSecond = UploadFile.make({ uploadId: 1, sizeMegabytes: secondFile.sizeMegabytes })
const uploadThird = UploadFile.make({ uploadId: 2, sizeMegabytes: thirdFile.sizeMegabytes })

const completedFirst = UploadsMessage.CompletedUploadFile({ uploadId: 0 })
const completedSecond = UploadsMessage.CompletedUploadFile({ uploadId: 1 })

const startUpload = UploadsMessage.ClickedStartUpload()
const cancelFirst = UploadsMessage.ClickedCancelUpload({ uploadId: 0 })

const statuses = (model: UploadsModel) => model.uploads.map((upload) => upload.status)

describe("Uploads", () => {
  it.effect("starting an upload appends an Uploading entry and runs UploadFile", () =>
    Effect.gen(function*() {
      const s = yield* Story.make(Uploads, {})
      s.send(startUpload)
      assert.deepStrictEqual(s.model.uploads, [
        { id: 0, fileName: firstFile.name, sizeMegabytes: firstFile.sizeMegabytes, status: "Uploading" }
      ])
      assert.strictEqual(s.model.uploadId, 1)
      s.expectExact(uploadFirst).resolve(uploadFirst, completedFirst)
      assert.deepStrictEqual(statuses(s.model), ["Done"])
    }))

  it.effect("cancelling an upload interrupts it and marks it Cancelled", () =>
    Effect.gen(function*() {
      const s = yield* Story.make(Uploads, {})
      s.send(startUpload)
        .send(cancelFirst)
      assert.deepStrictEqual(s.interrupted.map((command) => command.args), [uploadFirst.args])
      s.expectNone()
      assert.deepStrictEqual(statuses(s.model), ["Cancelled"])
    }))

  it.effect("cancelling a finished upload changes nothing and interrupts nothing", () =>
    Effect.gen(function*() {
      const s = yield* Story.make(Uploads, {})
      s.send(startUpload)
        .resolve(uploadFirst, completedFirst)
        .send(cancelFirst)
      assert.deepStrictEqual(s.interrupted, [])
      s.expectNone()
      assert.deepStrictEqual(statuses(s.model), ["Done"])
    }))

  it.effect("cancelling one upload leaves the other running", () =>
    Effect.gen(function*() {
      const s = yield* Story.make(Uploads, {})
      s.send(startUpload)
        .send(startUpload)
        .send(cancelFirst)
      assert.deepStrictEqual(s.interrupted.map((command) => command.args), [uploadFirst.args])
      s.expectExact(uploadSecond).resolve(uploadSecond, completedSecond)
      assert.deepStrictEqual(statuses(s.model), ["Cancelled", "Done"])
    }))

  it.effect("a new upload can start right after another is cancelled", () =>
    Effect.gen(function*() {
      const s = yield* Story.make(Uploads, {})
      s.send(startUpload)
        .send(cancelFirst)
        .send(startUpload)
      assert.deepStrictEqual(s.interrupted.map((command) => command.args), [uploadFirst.args])
      s.expectExact(uploadSecond).resolve(uploadSecond, completedSecond)
      assert.deepStrictEqual(statuses(s.model), ["Cancelled", "Done"])
    }))

  it.effect("restarting a cancelled upload reuses its id and file", () =>
    Effect.gen(function*() {
      const s = yield* Story.make(Uploads, {})
      s.send(startUpload)
        .send(cancelFirst)
        .send(UploadsMessage.ClickedRestartUpload({ uploadId: 0 }))
      assert.deepStrictEqual(statuses(s.model), ["Uploading"])
      s.expectExact(uploadFirst).resolve(uploadFirst, completedFirst)
      assert.deepStrictEqual(statuses(s.model), ["Done"])
    }))

  it.effect("cancel all interrupts every running upload and only those", () =>
    Effect.gen(function*() {
      const s = yield* Story.make(Uploads, {})
      s.send(startUpload)
        .send(startUpload)
        .send(startUpload)
        .resolve(uploadSecond, completedSecond)
        .send(UploadsMessage.ClickedCancelAllUploads())
      assert.deepStrictEqual(s.interrupted.map((command) => command.args), [uploadFirst.args, uploadThird.args])
      s.expectNone()
      assert.deepStrictEqual(statuses(s.model), ["Cancelled", "Done", "Cancelled"])
    }))
})
