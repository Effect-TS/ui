import { Subscription } from "@effect/ui"
import { type Duration, Schema, Stream } from "effect"

// Where a variant is in its steps. `step` is -1 before anything is
// sent, then the index of the step on screen; playback stops on the
// last step and leaves it on screen. `runs` counts the starts, so a
// restart gets a fresh timer.
export const Player = Schema.Struct({
  step: Schema.Number,
  isPlaying: Schema.Boolean,
  runs: Schema.Number
})
export type Player = typeof Player.Type

export const idle: Player = { step: -1, isPlaying: false, runs: 0 }

export const play = (player: Player, last: number): Player =>
  player.step >= last || player.step < 0
    ? { step: 0, isPlaying: true, runs: player.runs + 1 }
    : { ...player, isPlaying: true, runs: player.runs + 1 }

export const pause = (player: Player): Player => ({
  ...player,
  isPlaying: false
})

export const next = (player: Player, last: number): Player => ({
  ...player,
  step: Math.min(player.step + 1, last),
  isPlaying: false
})

export const back = (player: Player): Player => ({
  ...player,
  step: Math.max(player.step - 1, -1),
  isPlaying: false
})

export const seek = (player: Player, step: number): Player => ({
  ...player,
  step,
  isPlaying: false
})

export const reset = (player: Player): Player => ({
  ...player,
  step: -1,
  isPlaying: false
})

export const tick = (player: Player, last: number): Player =>
  player.step >= last
    ? { ...player, isPlaying: false }
    : { ...player, step: player.step + 1 }

// Ticks every `every` while the player plays: the first tick comes
// one interval after the start.
export const ticks = <M>(
  player: Player,
  every: Duration.Input,
  message: () => M,
  name = "tick"
) =>
  player.isPlaying &&
  Subscription.make(
    name,
    player.runs,
    () =>
      Stream.tick(every).pipe(
        Stream.drop(1),
        Stream.map(message)
      )
  )
