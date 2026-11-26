import { type Component, UiSchema, type View } from "@effect/ui"
import {
  FileDrop,
  type FileDropEvents,
  type FileDropProps,
  type FileDropRejectReason
} from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Context, Schema } from "effect"
import { describe, expect, it } from "tstyche"

class Clock extends Context.Service<Clock, {}>()("Clock") {}

const Msg = UiSchema.TaggedEnum({
  PickedAttachment: {},
  RejectedAttachment: {}
})
type Msg = typeof Msg.Type

declare const needsClock: View.Child<never, Clock>

type Element<K extends keyof HTMLElementTagNameMap, R = never> = Html.Element<
  Msg,
  R,
  Html.EventsOf<K>,
  HTMLElementTagNameMap[K],
  K
>

describe("FileDrop", () => {
  it("parts return the given builders, root accepts any element, trigger accepts only button", () => {
    Html.component({
      name: "App",
      model: Schema.Null,
      message: Msg
    }).make({
      init: () => null,
      update: ($) => $.model,
      view: (h) =>
        FileDrop(h, {
          props: { accept: ["image/*"], multiple: true },
          onEmit: (event) => {
            expect(event).type.toBe<FileDropEvents>()
            return event._tag === "Picked"
              ? Msg.PickedAttachment()
              : Msg.RejectedAttachment()
          },
          view: (fileDrop) => {
            expect(fileDrop.dragOver).type.toBe<boolean>()
            expect(fileDrop.disabled).type.toBe<boolean>()
            expect(fileDrop.trigger).type.not.toBeCallableWith(h.div)
            expect(fileDrop.trigger).type.not.toBeCallableWith({
              element: h.button
            })

            const section = fileDrop.root(h.section)
            expect(section).type.toBe<Element<"section">>()

            const combined = fileDrop.root(fileDrop.trigger(h.button))
            expect(combined).type.toBe<Element<"button">>()

            const root = fileDrop.root(h.div.class("dropzone")).children(
              fileDrop.trigger(h.button).children("Choose", needsClock)
            )
            expect(root).type.toBe<Element<"div", Clock>>()
            return root
          }
        })
    })
  })

  it("needs no services and exports props, reject reasons and events", () => {
    expect<Component.Headless.Requirements<typeof FileDrop>>().type.toBe<
      never
    >()
    expect<FileDropRejectReason>().type.toBe<
      "too-many-files" | "invalid-type"
    >()
    expect<FileDropProps>().type.toBe<{
      readonly accept?: ReadonlyArray<string> | undefined
      readonly multiple?: boolean | undefined
      readonly disabled?: boolean | undefined
    }>()
    expect<FileDropEvents>().type.toBe<
      | { readonly _tag: "Picked"; readonly files: ReadonlyArray<File> }
      | {
        readonly _tag: "Rejected"
        readonly files: ReadonlyArray<File>
        readonly reason: FileDropRejectReason
      }
    >()
  })
})
