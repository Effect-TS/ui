// @vitest-environment happy-dom
import type * as MessageLog from "@effect/ui/MessageLog"
import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import * as fs from "node:fs"
import * as path from "node:path"
import { type Capture, record } from "./fixtures/TwoEditors.ts"

const file = path.join(import.meta.dirname, "fixtures", "two-editor-traces.wire-v1.json")
const captures: ReadonlyArray<Capture> = ["interrupted", "open", "closed", "switched"]

const shape = (frames: ReadonlyArray<MessageLog.Wire>) => {
  const paths: { [path: string]: Array<string> } = {}
  for (const frame of frames) {
    if (!("path" in frame)) continue
    const detail = frame._tag === "Update"
      ? (frame.message as { readonly _tag: string })._tag
      : "reason" in frame
      ? frame.reason
      : ""
    ;(paths[frame.path] ??= []).push(frame._tag + " " + detail)
  }
  return paths
}

describe("TwoEditors", { concurrent: false }, () => {
  it.live("records what the checked-in traces hold", () =>
    Effect.gen(function*() {
      const recorded: { [capture: string]: ReadonlyArray<MessageLog.Wire> } = {}
      for (const capture of captures) recorded[capture] = yield* record(capture)
      if (process.env.TRACE_OUT !== undefined) {
        return fs.writeFileSync(process.env.TRACE_OUT, JSON.stringify(recorded, null, 2) + "\n")
      }
      const traces = JSON.parse(fs.readFileSync(file, "utf8"))
      for (const capture of captures) assert.deepStrictEqual(shape(recorded[capture]), shape(traces[capture]))
    }))
})
