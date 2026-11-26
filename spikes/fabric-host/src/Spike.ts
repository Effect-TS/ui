/**
 * The spike's throwaway vocabulary: just enough to render the counter and the
 * benchmark rows. Not a design for ui-native's elements.
 */
import * as Component from "@effect/ui/Component"
import * as View from "@effect/ui/View"
import * as Context from "effect/Context"
import type { FabricNode } from "./FabricHost.ts"

export class Host extends Context.Service<Host, {}>()("fabric-spike/Host") {}

export interface PressPayload {
  readonly x: number
  readonly y: number
}
interface Pressable {
  readonly press: PressPayload
}

type Container<Msg, E, Tag extends string> = View.Shorthand<
  View.ContainerBuilder<Msg, never, E, FabricNode, Tag>
>

export interface Tags<Msg> {
  readonly view: Container<Msg, Pressable, "view">
  readonly text: Container<Msg, Pressable, "text">
  readonly scroll: Container<
    Msg,
    { readonly scroll: { readonly x: number; readonly y: number } },
    "scroll"
  >
  readonly input: View.ElementBuilder<
    Msg,
    never,
    { readonly input: { readonly value: string } },
    FabricNode,
    "input"
  >
}

export interface Elements extends View.Elements {
  readonly Tags: Tags<this["Msg"]>
  readonly Host: Host
}

export const vocabulary: View.Vocabulary<Elements> = {
  name: "fabric-spike",
  tags: {
    view: View.shorthand(new View.ContainerBuilder("view")),
    text: View.shorthand(new View.ContainerBuilder("text")),
    scroll: View.shorthand(new View.ContainerBuilder("scroll")),
    input: new View.ElementBuilder("input")
  },
  textParents: ["text"]
}

export const component: Component.Define<Elements> = Component.withElements(
  vocabulary
)
