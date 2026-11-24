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
  /** The args published last when the reader started, then the newest published since. */
  unread: Array<unknown>
  /** Whether `unread` ends with args published since the reader started or last read. */
  behind: boolean
  /** While the reader waits with nothing unread: takes the next args, or `done` at the close. */
  resume: ((next: Effect.Effect<unknown, Cause.Done>) => void) | undefined
  /** How many args had been published when the reader began to wait. */
  since: number
}

/** @internal */
export interface MountArgs {
  latest: unknown
  closed: boolean
  /** How many args have been published. */
  published: number
  readonly readers: Set<Reader>
  /**
   * The order waiting readers get new args in. A reader joins at the end when it waits, and leaves when
   * args are published while it isn't waiting.
   */
  readonly order: Set<Reader>
}

/** @internal */
export const make = (args: unknown): MountArgs => ({
  latest: args,
  closed: false,
  published: 0,
  readers: new Set(),
  order: new Set()
})

/** @internal */
export const publish = (self: MountArgs, args: unknown): void => {
  self.latest = args
  const published = ++self.published
  for (const reader of self.readers) {
    if (reader.resume !== undefined) continue
    self.order.delete(reader)
    if (reader.behind) reader.unread[reader.unread.length - 1] = args
    else {
      reader.behind = true
      reader.unread.push(args)
    }
  }
  // A resumed reader runs at once, and can start a reader, wait again or publish. A reader that began to
  // wait during this publish has these args already, or newer ones.
  for (const reader of self.order) {
    const resume = reader.resume
    if (resume === undefined || reader.since >= published) continue
    reader.resume = undefined
    resume(Effect.succeed(args))
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
  for (const reader of Array.from(self.readers).reverse()) reader.resume?.(done)
  self.readers.clear()
  self.order.clear()
}

/** Takes what `reader` hasn't read, after `first`: one of the two isn't empty. */
const read = (
  reader: Reader,
  first: Array<unknown>
): Arr.NonEmptyReadonlyArray<unknown> => {
  const out = first.concat(reader.unread)
  reader.unread = []
  reader.behind = false
  return out as unknown as Arr.NonEmptyReadonlyArray<unknown>
}

/** @internal */
export const changes = (self: MountArgs): Stream.Stream<any> =>
  Stream.fromChannel(Channel.fromTransform((_, scope) => {
    const reader: Reader = {
      unread: [self.latest],
      behind: false,
      resume: undefined,
      since: 0
    }
    if (!self.closed) self.readers.add(reader)
    const pull = Effect.suspend(() => {
      if (self.closed) return done
      if (reader.unread.length > 0) return Effect.succeed(read(reader, []))
      return Effect.flatMap(
        Effect.callback<unknown, Cause.Done>((resume) => {
          reader.resume = resume
          reader.since = self.published
          self.order.add(reader)
          return Effect.sync(() => {
            reader.resume = undefined
          })
        }),
        // The close can come between the publish and this reader's turn.
        (args) => self.closed ? done : Effect.succeed(read(reader, [args]))
      )
    })
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
