import { Schema } from "effect"
import * as Counter from "./counter.ts"
import * as SignIn from "./signIn.ts"
import * as Snake from "./snake.ts"

export const ScenarioId = Schema.Literals([
  "counter",
  "signIn",
  "snake"
])
export type ScenarioId = typeof ScenarioId.Type

/**
 * The Play tests the figure can run, by tab. `sources` are the lines a
 * test runs, `notes` say what each one does, and `run` runs them and
 * returns the state after each.
 */
export const scenarios = {
  counter: {
    label: "Counter",
    title: "The delayed-reset Play test, line by line",
    ...Counter
  },
  signIn: {
    label: "Sign in",
    title: "The sign-in Play test, line by line",
    ...SignIn
  },
  snake: {
    label: "Snake",
    title: "The Snake Play test, line by line",
    ...Snake
  }
} satisfies Record<ScenarioId, unknown>
