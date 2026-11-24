import * as path from "node:path"
import type { RunnerTask, RunnerTestFile, RunnerTestSuite } from "vitest"
import { afterAll, beforeEach, expect } from "vitest"
import { pending } from "./pending.ts"

const nameOf = (task: RunnerTask): string => {
  const names = [task.name]
  for (
    let suite = task.suite;
    suite !== undefined && suite.type === "suite" && suite !== task.file;
    suite = suite.suite
  ) {
    names.unshift(suite.name)
  }
  return names.join(" > ")
}

const tests = path.join(import.meta.dirname, "..")

const pendingIn = (file: RunnerTestFile) =>
  pending[path.relative(tests, file.filepath).split(path.sep).join("/")] ?? {}

const testsOf = (suite: RunnerTestSuite): Array<string> =>
  suite.tasks.flatMap((task) =>
    task.type === "suite" ? testsOf(task) : [nameOf(task)]
  )

let file: RunnerTestFile | undefined

beforeEach((context) => {
  file = context.task.file
  const reason = pendingIn(file)[nameOf(context.task)]
  if (reason !== undefined) context.skip(`not ported yet: ${reason}`)
})

afterAll(() => {
  if (file === undefined) return
  const names = new Set(testsOf(file))
  const stale = Object.keys(pendingIn(file)).filter((name) => !names.has(name))
  expect(stale, "pending entries that name no test").toEqual([])
})
