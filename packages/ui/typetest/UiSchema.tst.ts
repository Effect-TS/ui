import { UiSchema } from "@effect/ui"
import { Effect, hole, pipe, Schema } from "effect"
import { describe, expect, it } from "tstyche"

describe("UiSchema.TaggedEnum", () => {
  const Shape = UiSchema.TaggedEnum({
    Circle: { radius: Schema.Number },
    Rect: { width: Schema.Number, height: Schema.FiniteFromString },
    Empty: {}
  })
  type Shape = typeof Shape.Type
  type Circle = typeof Shape.cases.Circle.Type

  it("is a schema that keeps its members after annotate", () => {
    expect(Schema.revealCodec(Shape)).type.toBe<
      Schema.Codec<
        | { readonly _tag: "Circle"; readonly radius: number }
        | { readonly _tag: "Rect"; readonly width: number; readonly height: number }
        | { readonly _tag: "Empty" },
        | { readonly _tag: "Circle"; readonly radius: number }
        | { readonly _tag: "Rect"; readonly width: number; readonly height: string }
        | { readonly _tag: "Empty" },
        never,
        never
      >
    >()
    expect(Shape.annotate({})).type.toBe<typeof Shape>()
    expect(Shape.cases.Circle).type.toBe<Schema.TaggedStruct<"Circle", { readonly radius: Schema.Number }>>()
  })

  it("constructors take the case Type without _tag", () => {
    expect(Shape.Circle({ radius: 1 })).type.toBe<Circle>()
    expect(Shape.Rect).type.toBeCallableWith({ width: 1, height: 2 })
    expect(Shape.Rect).type.not.toBeCallableWith({ width: 1, height: "2" })
    expect(Shape.Circle).type.not.toBeCallableWith({ _tag: "Circle", radius: 1 })
    expect(Shape.Circle).type.not.toBeCallableWith()
    expect(Shape.Empty).type.toBeCallableWith()
  })

  it("constructors require fields with constructor defaults", () => {
    const schema = UiSchema.TaggedEnum({
      A: { a: Schema.Number.pipe(Schema.withConstructorDefault(Effect.succeed(1))) }
    })
    expect(schema.A).type.not.toBeCallableWith()
    expect(schema.A).type.toBeCallableWith({ a: 1 })
  })

  it("is narrows on _tag", () => {
    const u = hole<unknown>()
    if (Shape.is("Circle")(u)) {
      expect(u).type.toBe<Circle>()
    }
    expect(Shape.is).type.not.toBeCallableWith("Square")
  })

  it("match is exhaustive, data-first and data-last", () => {
    const shape = hole<Shape>()
    const cases = { Circle: () => 1, Rect: () => "rect" as const, Empty: () => true }
    expect(Shape.match(shape, cases)).type.toBe<number | "rect" | boolean>()
    expect(pipe(shape, Shape.match(cases))).type.toBe<number | "rect" | boolean>()
    expect(Shape.match).type.not.toBeCallableWith(shape, { Circle: () => 1, Rect: () => 2 })
  })

  it("rejects reserved tags", () => {
    expect(UiSchema.TaggedEnum).type.not.toBeCallableWith({ ast: {} })
    expect(UiSchema.TaggedEnum).type.not.toBeCallableWith({ Type: {} })
    expect(UiSchema.TaggedEnum).type.not.toBeCallableWith({ is: {} })
    expect(UiSchema.TaggedEnum).type.not.toBeCallableWith({ match: {} })
    expect(UiSchema.TaggedEnum).type.not.toBeCallableWith({ name: {} })
    expect(UiSchema.TaggedEnum).type.not.toBeCallableWith({ valueOf: {} })
    expect(UiSchema.TaggedEnum).type.not.toBeCallableWith({ __defineGetter__: {} })
    expect(UiSchema.TaggedEnum).type.toBeCallableWith({ Ast: {} })
  })

  it("rejects a case that declares its own _tag", () => {
    expect(UiSchema.TaggedEnum).type.not.toBeCallableWith({ A: { _tag: Schema.Literal("B") } })
  })

  it("types numeric keys as string tags", () => {
    const Code = UiSchema.TaggedEnum({ 404: {}, Ok: {} })
    expect(Code[404]()).type.toBe<{ readonly _tag: "404" }>()
    expect(Code.is).type.toBeCallableWith("404")
    expect(Code.match).type.not.toBeCallableWith(Code.Ok(), { Ok: () => 1 })
  })
})
