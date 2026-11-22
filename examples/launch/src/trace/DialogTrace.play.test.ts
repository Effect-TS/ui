// @vitest-environment happy-dom
import { HtmlPlay } from "@effect/ui/html/testing"
// oxlint-disable-next-line no-unassigned-import
import "@effect/ui/html/register"
import { Locator, TestHost } from "@effect/ui/testing"
import { assert, it } from "@effect/vitest"
import { Effect } from "effect"
import { DialogPage } from "../demo/DialogPage.ts"
import { toSteps } from "./DialogTrace.ts"

it.layer(TestHost.layer(), { buildPerTest: true })("DialogTrace", (it) => {
  it.effect("turns the log of one open and one close into the figure's steps", () =>
    Effect.gen(function*() {
      const play = yield* HtmlPlay.make(DialogPage, {})
      yield* play.click(Locator.text("Discard draft", { exact: true }))
      yield* play.click(Locator.text("Keep editing", { exact: true }))
      const steps = play.root.log().flatMap(toSteps)
      assert.deepStrictEqual(steps.map((step) => `${step.kind} ${step.at} ${step.name}`), [
        "message dialog ClickedTrigger",
        "event dialog RequestedOpen",
        "message page RequestedOpenConfirm",
        "props dialog open: true",
        "message dialog ClickedClose",
        "event dialog RequestedClose",
        "message page RequestedCloseConfirm",
        "props dialog open: false"
      ])
      assert.deepStrictEqual(steps.map((step) => step.starts), [true, false, false, false, false, false, false, false])
      assert.deepStrictEqual(steps[2]?.page, ["confirm: true"])
      assert.deepStrictEqual(steps[6]?.page, ["confirm: false"])
      assert.strictEqual(steps[0]?.where, "/DialogPage/Dialog")
    }))
})
