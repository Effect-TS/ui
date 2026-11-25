import { assert, describe, it } from "@effect/vitest"
import * as Preview from "./Preview.ts"

const code = (count: number) =>
  Array.from(
    { length: count },
    (_, index) => `const line${index} = 0`
  )

describe("Preview", () => {
  it("starts after the imports and the blank lines around them", () => {
    const lines = [
      "import { Schema } from \"effect\"",
      "import {",
      "  Html,",
      "  HtmlCommand",
      "} from \"@effect/ui/html\"",
      "import \"./styles.css\"",
      "",
      "// The first line of code.",
      ...code(40)
    ]
    assert.deepStrictEqual(Preview.of(lines), {
      start: 7,
      end: 7 + Preview.shown
    })
  })

  it("starts at the top of a file without imports", () => {
    assert.deepStrictEqual(Preview.of(code(40)), {
      start: 0,
      end: Preview.shown
    })
  })

  it("leaves a file whole when collapsing would hide little", () => {
    const short = [
      "import { Schema } from \"effect\"",
      "",
      ...code(Preview.shown + Preview.worthHiding - 1)
    ]
    assert.strictEqual(Preview.of(short), undefined)
    assert.deepStrictEqual(Preview.of(short, 1), {
      start: 2,
      end: 2 + Preview.shown
    })
    assert.notStrictEqual(
      Preview.of([...short, "const last = 0"]),
      undefined
    )
  })

  it("has no preview for a file that fits in it", () => {
    assert.strictEqual(Preview.of(code(Preview.shown), 1), undefined)
    assert.strictEqual(Preview.of([], 1), undefined)
  })
})
