/**
 * SPIKE (EFF-4218), not for release. A message log for `Kernel`, which doesn't import this module. An
 * app that wants one makes it and passes its `record` to the mount.
 *
 * Left out: what caused an entry, the session, and the wire format the devtools read.
 */
import type * as Kernel from "./Kernel.ts"

/**
 * One thing the tree did.
 *
 * @stability experimental
 */
export interface Entry {
  readonly _tag: string
  readonly seq: number
  readonly at: number
  readonly path: string
  readonly component: Kernel.Runnable
  readonly [field: string]: unknown
}

/**
 * A log, and what a mount records into it.
 *
 * @stability experimental
 */
export interface Log {
  readonly record: Kernel.Recorder
  readonly entries: () => ReadonlyArray<Entry>
}

/**
 * A log that keeps its last `capacity` entries.
 *
 * @stability experimental
 */
export const make = (capacity = 1000): Log => {
  let seq = 0
  let entries: Array<Entry> = []
  return {
    record(inst, draft) {
      entries.push({ ...draft, seq: ++seq, at: Date.now(), path: inst.path, component: inst.component })
      if (entries.length > capacity * 2) entries = entries.slice(-capacity)
    },
    entries: () => entries.slice(-capacity)
  }
}
