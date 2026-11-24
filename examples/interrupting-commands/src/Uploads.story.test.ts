import { Story } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import {
  FAKE_FILES,
  UploadFile,
  Uploads,
  UploadsMessage,
  type UploadsModel
} from "./Uploads.ts"

const [firstFile, secondFile, thirdFile] = FAKE_FILES

const firstUploadCommand = UploadFile.make({
  uploadId: 0,
  sizeMegabytes: firstFile.sizeMegabytes
})
const secondUploadCommand = UploadFile.make({
  uploadId: 1,
  sizeMegabytes: secondFile.sizeMegabytes
})
const thirdUploadCommand = UploadFile.make({
  uploadId: 2,
  sizeMegabytes: thirdFile.sizeMegabytes
})

const completedFirst = UploadsMessage.CompletedUploadFile({ uploadId: 0 })
const completedSecond = UploadsMessage.CompletedUploadFile({ uploadId: 1 })

const clickedStartUpload = UploadsMessage.ClickedStartUpload()
const clickedCancelFirstUpload = UploadsMessage.ClickedCancelUpload({
  uploadId: 0
})

const statuses = (model: UploadsModel) =>
  model.uploads.map((upload) => upload.status)

describe("Uploads", () => {
  it.effect("starting an upload appends an Uploading entry and runs UploadFile", () =>
    Effect.gen(function*() {
      const s = yield* Story.make(Uploads, {})
      s.send(clickedStartUpload)
      assert.deepStrictEqual(s.model.uploads, [
        {
          id: 0,
          fileName: firstFile.name,
          sizeMegabytes: firstFile.sizeMegabytes,
          status: "Uploading"
        }
      ])
      assert.strictEqual(s.model.uploadId, 1)
      s.expectExact([firstUploadCommand]).resolve(
        firstUploadCommand,
        completedFirst
      )
      assert.deepStrictEqual(statuses(s.model), ["Done"])
    }))

  it.effect("cancelling an upload interrupts it and marks it Cancelled", () =>
    Effect.gen(function*() {
      const s = yield* Story.make(Uploads, {})
      s.send(clickedStartUpload)
        .send(clickedCancelFirstUpload)
      assert.deepStrictEqual(s.interrupted.map((command) => command.args), [
        firstUploadCommand.args
      ])
      s.expectNone()
      assert.deepStrictEqual(statuses(s.model), ["Cancelled"])
    }))

  it.effect("cancelling a finished upload changes nothing and interrupts nothing", () =>
    Effect.gen(function*() {
      const s = yield* Story.make(Uploads, {})
      s.send(clickedStartUpload)
        .resolve(firstUploadCommand, completedFirst)
        .send(clickedCancelFirstUpload)
      assert.deepStrictEqual(s.interrupted, [])
      s.expectNone()
      assert.deepStrictEqual(statuses(s.model), ["Done"])
    }))

  it.effect("cancelling one upload leaves the other running", () =>
    Effect.gen(function*() {
      const s = yield* Story.make(Uploads, {})
      s.send(clickedStartUpload)
        .send(clickedStartUpload)
        .send(clickedCancelFirstUpload)
      assert.deepStrictEqual(s.interrupted.map((command) => command.args), [
        firstUploadCommand.args
      ])
      s.expectExact([secondUploadCommand]).resolve(
        secondUploadCommand,
        completedSecond
      )
      assert.deepStrictEqual(statuses(s.model), ["Cancelled", "Done"])
    }))

  it.effect("a new upload can start right after another is cancelled", () =>
    Effect.gen(function*() {
      const s = yield* Story.make(Uploads, {})
      s.send(clickedStartUpload)
        .send(clickedCancelFirstUpload)
        .send(clickedStartUpload)
      assert.deepStrictEqual(s.interrupted.map((command) => command.args), [
        firstUploadCommand.args
      ])
      s.expectExact([secondUploadCommand]).resolve(
        secondUploadCommand,
        completedSecond
      )
      assert.deepStrictEqual(statuses(s.model), ["Cancelled", "Done"])
    }))

  it.effect("restarting a cancelled upload reuses its id and file", () =>
    Effect.gen(function*() {
      const s = yield* Story.make(Uploads, {})
      s.send(clickedStartUpload)
        .send(clickedCancelFirstUpload)
        .send(UploadsMessage.ClickedRestartUpload({ uploadId: 0 }))
      assert.deepStrictEqual(statuses(s.model), ["Uploading"])
      s.expectExact([firstUploadCommand]).resolve(
        firstUploadCommand,
        completedFirst
      )
      assert.deepStrictEqual(statuses(s.model), ["Done"])
    }))

  it.effect("cancel all interrupts every running upload and only those", () =>
    Effect.gen(function*() {
      const s = yield* Story.make(Uploads, {})
      s.send(clickedStartUpload)
        .send(clickedStartUpload)
        .send(clickedStartUpload)
        .resolve(secondUploadCommand, completedSecond)
        .send(UploadsMessage.ClickedCancelAllUploads())
      assert.deepStrictEqual(s.interrupted.map((command) => command.args), [
        firstUploadCommand.args,
        thirdUploadCommand.args
      ])
      s.expectNone()
      assert.deepStrictEqual(statuses(s.model), [
        "Cancelled",
        "Done",
        "Cancelled"
      ])
    }))
})
