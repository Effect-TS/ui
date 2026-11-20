import { Component, UiSchema } from "@effect/ui"
import { Schema } from "effect"
import { describe, expect, it } from "tstyche"

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

declare const coupon: Coupon
declare const auth: Auth
declare const withFunction: { readonly format: (n: number) => string; readonly label: string }

describe("$.evolve", () => {
  it("takes a value or a function of the old value for each field, and nothing else", () => {
    Def.update((_model, _message, $) => {
      expect($.evolve({ attempts: 1, coupon: Component.evolve({ status: "Idle" }) })).type.toBe<Step>()
      expect($.evolve({ attempts: (n) => n + 1 }).evolve({ attempts: 2 })).type.toBe<Step>()
      expect($.evolve).type.not.toBeCallableWith({ atempts: 1 })
      expect($.evolve).type.not.toBeCallableWith({ attempts: "1" })
      expect($.evolve).type.not.toBeCallableWith({ attempts: (n: number) => String(n) })
      // A partial struct isn't merged.
      expect($.evolve).type.not.toBeCallableWith({ coupon: { status: "Idle" } })
      expect($.evolve).type.not.toBeCallableWith({ coupon: Component.evolve({ status: "Nope" }) })
      // A nullable struct is a union.
      expect($.evolve).type.not.toBeCallableWith({ maybe: Component.evolve({ status: "Idle" }) })
      return $
    })
  })

  it("rejects a union Model", () => {
    AuthDef.update((model, _message, $) => {
      expect($.evolve).type.not.toBeCallableWith({ email: "a@b.c" })
      return model
    })
  })
})

describe("Component.evolve", () => {
  it("is data-first and data-last, with the same rules", () => {
    expect(Component.evolve(coupon, { status: "Idle" })).type.toBe<Coupon>()
    expect(Component.evolve<Coupon>({ code: (code) => code.trim() })).type.toBe<(self: Coupon) => Coupon>()
    expect(Component.evolve).type.not.toBeCallableWith(coupon, { stauts: "Idle" })
    expect(Component.evolve).type.not.toBeCallableWith(coupon, { status: "Nope" })
  })

  it("rejects a union until it is matched", () => {
    expect(Component.evolve).type.not.toBeCallableWith(auth, { email: "a@b.c" })
    expect(Auth.match(auth, { LoggedOut: (auth) => auth, LoggedIn: Component.evolve({ name: "Ada" }) })).type.toBe<
      Auth
    >()
    Auth.match(auth, {
      // @ts-expect-error 'name' does not exist
      LoggedOut: Component.evolve({ name: "Ada" }),
      // @ts-expect-error Type '"LoggedOut"' is not assignable
      LoggedIn: Component.evolve({ _tag: "LoggedOut" })
    })
  })

  it("can't set a field whose type is a function", () => {
    expect(Component.evolve(withFunction, { label: "x" })).type.toBe<typeof withFunction>()
    expect(Component.evolve).type.not.toBeCallableWith(withFunction, { format: (n: number) => String(n + 1) })
  })
})
