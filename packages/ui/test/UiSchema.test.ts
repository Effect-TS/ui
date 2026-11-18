import { UiSchema } from "@effect/ui"
import { assert, describe, it } from "@effect/vitest"
import { pipe, Schema } from "effect"

describe("UiSchema", () => {
  describe("TaggedEnum", () => {
    const Shape = UiSchema.TaggedEnum({
      Circle: { radius: Schema.Number.check(Schema.isGreaterThan(0)) },
      Rect: { width: Schema.Number, height: Schema.FiniteFromString },
      Empty: {}
    }).annotate({ title: "Shape" })

    it("constructors only add _tag", () => {
      assert.deepStrictEqual(Shape.Circle({ radius: -1 }), { _tag: "Circle", radius: -1 })
      assert.deepStrictEqual(Shape.Empty(), { _tag: "Empty" })
    })

    it("is checks only _tag", () => {
      assert.isTrue(Shape.is("Circle")({ _tag: "Circle" }))
      assert.isFalse(Shape.is("Circle")(Shape.Empty()))
      assert.isFalse(Shape.is("Circle")(null))
    })

    it("match supports data-first and data-last", () => {
      const cases = { Circle: () => "circle", Rect: () => "rect", Empty: () => "empty" }
      assert.strictEqual(Shape.match(Shape.Rect({ width: 1, height: 2 }), cases), "rect")
      assert.strictEqual(pipe(Shape.Empty(), Shape.match(cases)), "empty")
    })

    it("decodes as a tagged union", () => {
      assert.deepStrictEqual(
        Schema.decodeUnknownSync(Shape)({ _tag: "Rect", width: 1, height: "2" }),
        Shape.Rect({ width: 1, height: 2 })
      )
      assert.strictEqual(Shape.ast.annotations?.title, "Shape")
      assert.strictEqual(Shape.cases.Rect.fields.height, Schema.FiniteFromString)
    })

    it("throws when a case declares its own _tag", () => {
      assert.throws(
        () => UiSchema.TaggedEnum({ A: { _tag: Schema.Literal("B") } } as any),
        "Case A can't declare _tag"
      )
    })

    it("numeric keys become string tags", () => {
      const Code = UiSchema.TaggedEnum({ 404: {}, Ok: {} })
      assert.deepStrictEqual(Code[404](), { _tag: "404" })
      assert.isTrue(Code.is("404")(Schema.decodeUnknownSync(Code)({ _tag: "404" })))
    })
  })
})
