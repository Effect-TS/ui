import { Html } from "@effect/ui/html"
import { TestHost } from "@effect/ui/testing"
import { Layer } from "effect"

// Every scroll a test asked for, oldest first.
export const scrolls: Array<Html.ScrollOptions> = []

/**
 * The test host with the element operations stood in for. It has no
 * page to scroll or measure, so each scroll is recorded in `scrolls`
 * and every measurement is empty.
 */
export const TestLayer = Layer.merge(
  TestHost.layer(),
  Layer.succeed(Html.Host, {
    focus: () => {},
    blur: () => {},
    scrollIntoView: (_element, options) => {
      scrolls.push(options)
    },
    measure: () => ({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      top: 0,
      right: 0,
      bottom: 0,
      left: 0
    }),
    select: () => {},
    requestSubmit: () => false,
    showPicker: () => false
  })
)
