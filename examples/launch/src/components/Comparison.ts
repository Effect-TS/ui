import * as Preview from "#domain/Preview"
import { Snippet, textOf } from "#domain/Snippet"
import { UiSchema } from "@effect/ui"
import { Tabs } from "@effect/ui-kit"
import { Html } from "@effect/ui/html"
import { Schema } from "effect"
import { Code } from "./Code.ts"
import { CodeGroup } from "./CodeGroup.ts"
import * as TabStrip from "./TabStrip.ts"

export const ComparisonMessage = UiSchema.TaggedEnum({
  SelectedSide: { label: Schema.String }
})

// `label` names the side's tab, and `about` says what its code does.
export const Side = Schema.Struct({
  label: Schema.String,
  about: Schema.String,
  files: Schema.Array(Snippet)
})
export type Side = typeof Side.Type

/**
 * The same code written two ways, one side at a time, with a tab for
 * each side. The files are in a CodeGroup, so a file that is open
 * stays open when the other side shows.
 *
 * The `example` slot is for the app the code builds, running. It goes
 * above the tabs, because it's the same app on both sides.
 */
export const Comparison = Html.component({
  name: "Comparison",
  props: Schema.Struct({ sides: Schema.Array(Side) }),
  model: Schema.Struct({ selected: Schema.String }),
  message: ComparisonMessage,
  slots: ["example"]
}).make({
  // The last side is the new way, which shows first.
  init: ($) => $.set({ selected: $.props.sides.at(-1)?.label ?? "" }),
  update: {
    SelectedSide: ($, { label }) => $.evolve({ selected: label })
  },
  view: (h, model) => {
    const { sides } = h.props
    return CodeGroup(h, {
      view: () =>
        Tabs(h, {
          key: "sides",
          props: {
            value: model.selected,
            tabs: sides.map(({ label }) => ({ value: label })),
            // The arrow keys show the next side as they move to its
            // tab.
            activateOnFocus: true
          },
          onEmit: {
            Selected: ({ value }) =>
              ComparisonMessage.SelectedSide({ label: value })
          },
          view: (tabs) =>
            // Clipped, not hidden: a hidden overflow would stop the
            // pinned button of an open file from following the page.
            tabs.root(
              h.div.class(
                "comparison overflow-clip rounded-lg border",
                "border-border bg-card",
                // The files are sections of this one card, not
                // cards of their own.
                "[&_.code-window]:rounded-none",
                "[&_.code-window]:border-x-0",
                "[&_.code-window]:border-b-0",
                "[&_.code-window]:[box-shadow:none]"
              )
            ).children(
              h.slots.example,
              h.div.class(TabStrip.strip).children(
                tabs.list(
                  h.div.class(TabStrip.list).attr(
                    "aria-label",
                    "Version"
                  )
                ).children(
                  tabs.indicator(h.span.class(TabStrip.indicator)),
                  sides.map(({ label }) =>
                    tabs.tab({
                      element: h.button.key(label).class(
                        TabStrip.tab
                      ),
                      value: label
                    }).children(label)
                  )
                )
              ),
              sides.map((side) =>
                tabs.panel({
                  element: h.div.key(side.label).class(
                    "data-[ending-style]:hidden"
                  ),
                  value: side.label
                })?.children(
                  h.p.class("px-4 py-3 text-sm text-muted-foreground")
                    .children(side.about),
                  side.files.map((snippet, row) =>
                    h.div.key(snippet.id).children(
                      Code(h, snippet, {
                        preview: Preview.of(textOf(snippet)),
                        row
                      })
                    )
                  )
                )
              )
            )
        })
    })
  }
})
