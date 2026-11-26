import * as ListNavigation from "@effect/ui-kit/ListNavigation"
import { assert, describe, it } from "@effect/vitest"

describe("ListNavigation", () => {
  it("target returns -1 for navigation keys on an empty list and undefined for other keys", () => {
    const empty = { at: -1, last: -1 }
    for (const key of ["Home", "End", "ArrowDown", "ArrowUp"]) {
      assert.strictEqual(ListNavigation.target(key, empty), -1)
    }
    assert.isUndefined(ListNavigation.target("a", empty))
  })
})
