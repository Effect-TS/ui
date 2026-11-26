/**
 * A tiny element vocabulary for the tests: a `box` that can't hold text, a
 * `label` that can, and a void `field` with a value, an input event and its
 * own node type for refs and mounts.
 */
import { View } from "@effect/ui"

export interface TinyField {
  readonly _tag: "Field"
}

export interface TinyHost {
  readonly TinyHost: unique symbol
}

export class TinyVoid<
  out Msg,
  out R = never,
  in out Handlers = Record<string, unknown>,
  in out Node = unknown
> extends View.ElementBuilder<Msg, R, Handlers, Node> {
  declare readonly "~With"?: TinyVoid<Msg, R | this["~Add"], Handlers, Node>
  value(value: string): this {
    return this.prop("value", value)
  }
}

export class TinyElement<
  out Msg,
  out R = never,
  in out Handlers = Record<string, unknown>,
  in out Node = unknown
> extends TinyVoid<Msg, R, Handlers, Node> {
  declare readonly "~With"?: TinyElement<
    Msg,
    R | this["~Add"],
    Handlers,
    Node
  >
  children<This, const C extends ReadonlyArray<View.Input<Msg, any>>>(
    this: This,
    ...inputs: C
  ): View.WithRequirements<This, View.Requirements<C[number]>>
  children(...inputs: ReadonlyArray<View.Input<Msg, unknown>>): unknown {
    return View.withContent(this, inputs)
  }
}

export interface TinyTags<Msg> {
  readonly box: View.Shorthand<TinyElement<Msg, never, { readonly click: {} }>>
  readonly label: View.Shorthand<
    TinyElement<Msg, never, { readonly click: {} }>
  >
  readonly field: TinyVoid<
    Msg,
    never,
    { readonly input: { readonly value: string } },
    TinyField
  >
}

export interface Tiny extends View.Elements {
  readonly Tags: TinyTags<this["Msg"]>
  readonly Host: TinyHost
}

export const Tiny: View.Vocabulary<Tiny> = {
  name: "tiny",
  tags: {
    box: View.shorthand(new TinyElement("box")),
    label: View.shorthand(new TinyElement("label")),
    field: new TinyVoid("field")
  },
  textParents: ["label"]
}
