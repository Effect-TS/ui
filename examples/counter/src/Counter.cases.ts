import { Case } from "@effect/ui/testing"
import { Counter, CounterMessage } from "./Counter.ts"

// Each case is at /__workbench/Counter/<key> while `vite` runs.
export const CounterCases = Case.make(Counter, {
  zero: {},
  negative: { model: { count: -3 } },
  incremented: {
    messages: [
      CounterMessage.ClickedIncrement(),
      CounterMessage.ClickedIncrement()
    ]
  }
})
