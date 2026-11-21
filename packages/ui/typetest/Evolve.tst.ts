import { Schema } from "effect"
import { describe, expect, it } from "tstyche"

import { Component, UiSchema, UiStruct } from "@effect/ui"

const Coupon = Schema.Struct({ code: Schema.String, status: Schema.Literals(["Idle", "Applied"]) })
type Coupon = typeof Coupon.Type
const Auth = UiSchema.TaggedEnum({
  LoggedOut: { email: Schema.String },
  LoggedIn: { email: Schema.String, name: Schema.String }
})
type Auth = typeof Auth.Type
const Message = UiSchema.TaggedEnum({ Clicked: {} })

const Def = Component.define({
  name: "Checkout",
  model: Schema.Struct({ coupon: Coupon, maybe: Schema.NullOr(Coupon), attempts: Schema.Number }),
  message: Message
})
type Step = Component.Step<typeof Def.model.Type, typeof Message.Type, never>
const AuthDef = Component.define({ name: "Auth", model: Auth, message: Message })
const CountDef = Component.define({ name: "Count", model: Schema.Number, message: Message })

declare const coupon: Coupon
declare const auth: Auth
declare const overlapping: { readonly count: number } | { readonly count: number; readonly extra: string }
declare const withSpecialFields: {
  readonly format: (n: number) => string
  readonly onSave?: (n: number) => string
  readonly label: string
  readonly value: any
}

describe("$.evolve", () => {
  it("takes a value or a function of the old value for each field, and nothing else", () => {
    Def.update((_model, _message, $) => {
      expect($.evolve({ attempts: 1, coupon: UiStruct.evolve({ status: "Idle" }) })).type.toBe<Step>()
      expect($.evolve({ attempts: (n) => n + 1 }).evolve({ attempts: 2 })).type.toBe<Step>()
      expect($.evolve).type.not.toBeCallableWith({ atempts: 1 })
      expect($.evolve).type.not.toBeCallableWith({ attempts: "1" })
      expect($.evolve).type.not.toBeCallableWith({ attempts: (n: number) => String(n) })
      // A partial struct isn't merged.
      expect($.evolve).type.not.toBeCallableWith({ coupon: { status: "Idle" } })
      // @ts-expect-error Type '"Nope"' is not assignable
      $.evolve({ coupon: UiStruct.evolve({ status: "Nope" }) })
      // A nullable struct is a union.
      // @ts-expect-error match the union first
      $.evolve({ maybe: UiStruct.evolve({ status: "Idle" }) })
      return $
    })
  })

  it("rejects non-struct Models", () => {
    AuthDef.update((model, _message, $) => {
      expect($.evolve).type.not.toBeCallableWith({ email: "a@b.c" })
      return model
    })
    CountDef.update((model, _message, $) => {
      expect($.evolve).type.not.toBeCallableWith(1)
      expect($.evolve).type.not.toBeCallableWith({})
      return model
    })
  })
})

describe("UiStruct.evolve", () => {
  it("is data-first and data-last, with the same rules", () => {
    expect(UiStruct.evolve(coupon, { status: "Idle" })).type.toBe<Coupon>()
    expect(UiStruct.evolve<Coupon>({ code: (code) => code.trim() })).type.toBe<(self: Coupon) => Coupon>()
    // Fields declared on their own are checked with `satisfies`, which also types the updaters.
    const trim = { code: (code) => code.trim() } satisfies UiStruct.EvolveFields<Coupon>
    expect(UiStruct.evolve(coupon, trim)).type.toBe<Coupon>()
    // @ts-expect-error 'stauts' does not exist
    void ({ stauts: "Idle" } satisfies UiStruct.EvolveFields<Coupon>)
    // Non-structs and untyped data-last calls are rejected.
    expect(UiStruct.evolve).type.not.toBeCallableWith({ status: "Idle" })
    expect(UiStruct.evolve).type.not.toBeCallableWith([1, 2], [3])
    expect(UiStruct.evolve).type.not.toBeCallableWith(1, 2)
    expect(UiStruct.evolve).type.not.toBeCallableWith((n: number) => n, {})
    expect(UiStruct.evolve).type.not.toBeCallableWith({}, 1)
    expect(UiStruct.evolve).type.not.toBeCallableWith({}, { typo: 1 })
  })

  it("rejects a union until it is matched", () => {
    expect(UiStruct.evolve).type.not.toBeCallableWith(overlapping, { count: 1 })
    expect(Auth.match(auth, { LoggedOut: (auth) => auth, LoggedIn: UiStruct.evolve({ name: "Ada" }) })).type.toBe<
      Auth
    >()
    Auth.match(auth, {
      // @ts-expect-error 'name' does not exist
      LoggedOut: UiStruct.evolve({ name: "Ada" }),
      // @ts-expect-error Type '"LoggedOut"' is not assignable
      LoggedIn: UiStruct.evolve({ _tag: "LoggedOut" })
    })
  })

  it("can't set a field whose type is a function", () => {
    expect(UiStruct.evolve(withSpecialFields, { label: "x", value: 1 })).type.toBe<typeof withSpecialFields>()
    expect(UiStruct.evolve).type.not.toBeCallableWith(withSpecialFields, {
      format: (n: number) => String(n + 1)
    })
    expect(UiStruct.evolve).type.not.toBeCallableWith(withSpecialFields, { onSave: (n: number) => String(n) })
  })
})
