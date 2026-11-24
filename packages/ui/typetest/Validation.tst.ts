import { Validation } from "@effect/ui"
import type { Option } from "effect"
import { Schema } from "effect"
import { AsyncResult } from "effect/reactivity"
import { describe, expect, it } from "tstyche"

const Rule = Validation.Rule

describe("Validation.make", () => {
  const Form = Validation.make({
    name: { required: "Name is required", rules: [Rule.minLength(2)] },
    notes: {},
    subscribed: { value: Schema.Boolean },
    tags: { value: Schema.Array(Schema.String), rules: [Rule.maxItems(3)] },
    age: { value: Schema.NumberFromString },
    confirm: {
      required: (values) => values.subscribed && "Confirm to subscribe",
      rules: [[
        (confirm, values) => confirm === values.name,
        "Must match the name"
      ]]
    }
  })
  type Values = {
    readonly name: string
    readonly notes: string
    readonly subscribed: boolean
    readonly tags: ReadonlyArray<string>
    readonly age: number
    readonly confirm: string
  }

  it("infers State and Validated types from fields", () => {
    expect(Form.init).type.toBe<(values: Values) => Validation.State<Values>>()
    expect(Form.State.Type).type.toBe<Validation.State<Values>>()
    expect(Form.State.Encoded.values.age).type.toBe<string>()
    const validated = Form.validate(Form.init(null!))
    expect(validated.fields.tags).type.toBe<
      Validation.Field<ReadonlyArray<string>>
    >()
    expect(validated.fields.notes).type.toBe<Validation.Field<string>>()
    expect(validated.value).type.toBe<Option.Option<Values>>()
  })

  it("types names and values in change, blur, reject and checks", () => {
    const state = Form.init(null!)
    expect(Form.change(state, "subscribed", true)).type.toBe<
      Validation.State<Values>
    >()
    expect(Form.change("tags", ["a"])).type.toBe<
      (self: Validation.State<Values>) => Validation.State<Values>
    >()
    expect(Form.change).type.not.toBeCallableWith(state, "subscribed", "yes")
    expect(Form.change).type.not.toBeCallableWith(state, "missing", "")
    expect(Form.blur).type.not.toBeCallableWith(state, "missing")
    expect(Form.reject).type.not.toBeCallableWith(state, { missing: ["x"] })
    expect(Form.checklist(state, "name")).type.toBe<
      ReadonlyArray<Validation.ChecklistItem>
    >()
    expect(Form.checklist).type.not.toBeCallableWith(state, "missing")
    expect(Form.validate).type.toBeCallableWith(state, {
      name: AsyncResult.success(["Taken"])
    })
    expect(Form.validate).type.not.toBeCallableWith(state, {
      name: AsyncResult.success(true)
    })
  })

  it("infers every field when each is only functions", () => {
    const Pair = Validation.make({
      a: { rules: [[(a, values) => a !== values.b, "Must differ from b"]] },
      b: { required: (values) => values.a !== "" && "Required with a" }
    })
    expect(Pair.init).type.toBe<
      (
        values: { readonly a: string; readonly b: string }
      ) => Validation.State<{ readonly a: string; readonly b: string }>
    >()
  })

  it("rejects a rule that doesn't fit its field", () => {
    expect(Validation.make).type.not.toBeCallableWith({
      tags: { value: Schema.Array(Schema.String), rules: [Rule.minLength(2)] }
    })
    expect(Validation.make).type.not.toBeCallableWith({
      name: { rules: [Rule.minItems(1)] }
    })
    expect(Validation.make).type.not.toBeCallableWith({
      name: { value: "string" }
    })
    // A rule can't read a field the form doesn't have.
    // @ts-expect-error Property 'missing' does not exist
    Validation.make({
      name: { rules: [[(_, values) => values.missing === "", "x"]] }
    })
  })
})
