// The measurement scripts read these logs from logcat.
// oxlint-disable no-console
/**
 * The startup log and the js-framework-benchmark run, shared by the
 * @effect/ui and React apps, so messages are plain tagged objects.
 */
import type { Msg } from "./rows.ts"

declare const global: {
  nativePerformanceNow?: () => number
  __BUNDLE_START_TIME__: number
}
/**
 * Native monotonic clock. `performance` is installed by React Native's
 * InitializeCore, which the @effect/ui entry does not run.
 */
export const now = (): number => global.nativePerformanceNow?.() ?? Date.now()
const frame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
const median = (xs: Array<number>) => {
  const sorted = [...xs].sort((a, b) => a - b)
  return Math.round(sorted[sorted.length >> 1] * 10) / 10
}

let firstCommit = true
let onCommit: (() => void) | undefined

/**
 * Each app calls this after every commit to Fabric (`completeRoot` returned,
 * so layout is done and the mount is queued for the UI thread). Logs
 * `SPIKE_STARTUP` for the first, and ends the operation being timed.
 */
export const committed = (): void => {
  if (firstCommit) {
    firstCommit = false
    console.log(
      `SPIKE_STARTUP ${
        JSON.stringify({
          bundleStartToFirstCommitMs: now() - global.__BUNDLE_START_TIME__
        })
      }`
    )
  }
  const resolve = onCommit
  onCommit = undefined
  resolve?.()
}

/**
 * Runs the benchmark's operations through `dispatch`, timing each until its
 * commit. Logs one `SPIKE_BENCH` line with the median of each, in ms.
 */
export const runBench = async (dispatch: (message: Msg) => void) => {
  const send = (message: Msg) =>
    new Promise<void>((resolve) => {
      onCommit = resolve
      dispatch(message)
    })
  const runs = 7
  const results: Record<
    string,
    { commit: Array<number>; frame: Array<number> }
  > = {}
  const time = async (name: string, message: Msg) => {
    const t0 = now()
    await send(message)
    const t1 = now()
    await frame()
    const t2 = now()
    const entry = results[name] ??= { commit: [], frame: [] }
    entry.commit.push(t1 - t0)
    entry.frame.push(t2 - t0)
  }
  const settle = () => new Promise((resolve) => setTimeout(resolve, 100))
  // Let startup work finish first.
  await new Promise((resolve) => setTimeout(resolve, 2000))
  for (let i = 0; i < runs; i++) {
    await time("create1k", { _tag: "Run" })
    await settle()
    await time("replace1k", { _tag: "Run" })
    await settle()
    await time("update10th", { _tag: "Update" })
    await settle()
    await time("select", { _tag: "Select", id: 3000 * i + 1005 })
    await settle()
    await time("swap", { _tag: "SwapRows" })
    await settle()
    await time("removeOne", { _tag: "Remove", id: 3000 * i + 1010 })
    await settle()
    await time("append1k", { _tag: "Add" })
    await settle()
    await time("clear2k", { _tag: "Clear" })
    await settle()
  }
  for (let i = 0; i < 3; i++) {
    await time("create10k", { _tag: "RunLots" })
    await settle()
    await time("clear10k", { _tag: "Clear" })
    await settle()
  }
  const summary: Record<string, { commit: number; frame: number }> = {}
  for (const name in results) {
    summary[name] = {
      commit: median(results[name].commit),
      frame: median(results[name].frame)
    }
  }
  console.log(`SPIKE_BENCH ${JSON.stringify(summary)}`)
}
