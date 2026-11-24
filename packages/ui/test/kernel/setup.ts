import * as HtmlHydrate from "@effect/ui/html/HtmlHydrate"
import * as browserHosts from "@effect/ui/html/internal/browserHosts"
import * as KernelDom from "@effect/ui/html/KernelDom"
import * as domHost from "@effect/ui/internal/next/domHost"
import * as path from "node:path"
import type { RunnerTask, RunnerTestFile, RunnerTestSuite } from "vitest"
import { afterAll, beforeEach, expect } from "vitest"
import { pending } from "./pending.ts"

// A host `BrowserHost.makeHost` made runs on the kernel's DOM host. One a test wraps keeps the bridge to it.
domHost.set(
  (host, container, options) =>
    browserHosts.made.has(host) && (container as Node).nodeType !== undefined
      ? KernelDom.makeHost(container as Element, {
        head: options.head ? KernelDom.syncHead : undefined,
        step: options.step
      })
      : undefined,
  HtmlHydrate.adopt
)

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
  if (
    reason !== undefined && globalThis.process?.env.KERNEL_UNPEND === undefined
  ) {
    context.skip(`not ported yet: ${reason}`)
  }
})

afterAll(() => {
  if (file === undefined) return
  const names = new Set(testsOf(file))
  const stale = Object.keys(pendingIn(file)).filter((name) => !names.has(name))
  expect(stale, "pending entries that name no test").toEqual([])
})
