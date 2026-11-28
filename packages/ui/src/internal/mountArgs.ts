/**
 * The args a mount's `changes` Stream reads. A reader starts with the args published last, then gets
 * each one published after. A reader that falls behind keeps only the newest it hasn't read.
 * Readers that wait get new args in the order they began to wait.
 *
 * @internal
 */
import type * as Arr from "effect/Array"
import * as Cause from "effect/Cause"
import * as Channel from "effect/Channel"
import * as Effect from "effect/Effect"
import * as Scope from "effect/Scope"
import * as Stream from "effect/Stream"

interface Reader {
  /** The args published last when the reader started or woke, then the newest published since. */
  unread: Array<unknown>
  /** Whether `unread` ends with args published since the reader started, woke or last read. */
  behind: boolean
  resume: ((wake: Effect.Effect<void>) => void) | undefined
}

/** @internal */
export interface MountArgs {
  latest: unknown
  closed: boolean
  readonly readers: Set<Reader>
  /** Waiting readers in wake order. A reader that waits again rejoins at the end. */
  readonly order: Set<Reader>
}

/** @internal */
export const make = (args: unknown): MountArgs => ({
  latest: args,
  closed: false,
  readers: new Set(),
  order: new Set()
})

/** @internal */
export const publish = (self: MountArgs, args: unknown): void => {
  self.latest = args
  for (const reader of self.readers) {
    if (reader.behind) reader.unread[reader.unread.length - 1] = args
    else {
      reader.behind = true
      reader.unread.push(args)
    }
  }
  // A woken reader runs at once, and can start a reader, wait again or publish. A reader that began to
  // wait during this publish has nothing unread.
  for (const reader of self.order) {
    const resume = reader.resume
    if (resume === undefined || reader.unread.length === 0) continue
    self.order.delete(reader)
    reader.resume = undefined
    // Preserve these args if more arrive before the reader consumes them.
    reader.behind = false
    resume(Effect.void)
  }
}

const done = Cause.done()

/**
 * Ends every reader, the newest first: what they haven't read is dropped.
 *
 * @internal
 */
export const close = (self: MountArgs): void => {
  self.closed = true
  for (const reader of Array.from(self.readers).reverse()) {
    reader.resume?.(Effect.void)
  }
  self.readers.clear()
  self.order.clear()
}

/** @internal */
export const changes = (self: MountArgs): Stream.Stream<any> =>
  Stream.fromChannel(Channel.fromTransform((_, scope) => {
    const reader: Reader = {
      unread: [self.latest],
      behind: false,
      resume: undefined
    }
    if (!self.closed) self.readers.add(reader)
    const pull = Effect.flatMap(
      // Check and register without yielding, so an update or close cannot go unnoticed.
      Effect.callback<void>((resume) => {
        if (self.closed || reader.unread.length > 0) return resume(Effect.void)
        reader.resume = resume
        self.order.add(reader)
        return Effect.sync(() => {
          reader.resume = undefined
          self.order.delete(reader)
        })
      }),
      // The close can come between the wake and this reader's turn.
      () => {
        if (self.closed) return done
        const unread = reader.unread
        reader.unread = []
        reader.behind = false
        return Effect.succeed(
          unread as unknown as Arr.NonEmptyReadonlyArray<unknown>
        )
      }
    )
    return Effect.as(
      Scope.addFinalizer(
        scope,
        Effect.sync(() => {
          self.readers.delete(reader)
          self.order.delete(reader)
        })
      ),
      pull
    )
  }))
