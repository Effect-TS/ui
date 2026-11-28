import type { Native } from "@effect/ui-native"
import { Link } from "@effect/ui-native/kit"
import type * as Router from "@effect/ui/Router"
import type * as View from "@effect/ui/View"
import { describe, expect, it } from "tstyche"

declare const h: Native.H<never>

describe("Link", () => {
  it("requires the Router", () => {
    expect(Link(h, { href: "/" })).type.toBe<
      View.WithRequirements<
        Native.ViewElement<never, never, Native.ViewEvents, "view">,
        Router.Router
      >
    >()
    expect(Link(h, { href: "/" }).children(h.text("a"))).type.toBeAssignableTo<
      Native.ViewElement<never, Router.Router, Native.ViewEvents, "view">
    >()
    expect(Link(h, { href: "/" }).children(h.text("a"))).type.not
      .toBeAssignableTo<
        Native.ViewElement<never, never, Native.ViewEvents, "view">
      >()
  })
})
