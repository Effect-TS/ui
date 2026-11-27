/**
 * @title Custom elements
 *
 * Use web components from other libraries in an HTML view: bind each tag
 * with its properties and events once, set them with typed methods, and fire
 * an element's event in a scene. Then publish a component as a web
 * component of its own.
 */
import { UiSchema } from "@effect/ui"
import { BrowserHost, Html } from "@effect/ui/html"
import { HtmlScene } from "@effect/ui/html/testing"
import { Locator } from "@effect/ui/testing"
import { Effect, Layer, Schema } from "effect"

// ---------------------------------------------------------------------------
// Bindings: a tag, its properties and its events
// ---------------------------------------------------------------------------

// A binding describes an element another library defines, here
// vanilla-colorful's `<hex-color-picker>`. It is defined once, at module
// level, like a Command. It doesn't register the element: the app's entry
// point imports the library (`import "vanilla-colorful/hex-color-picker.js"`),
// so a scene test, which has no DOM, can import the component without it.
export const ColorPicker = Html.customElement({
  tag: "hex-color-picker",
  // Each property is written as a JavaScript property, not an attribute, so
  // its Schema can describe any value: a string here, an array or an object
  // elsewhere. The binding gets a `.color(value)` method typed by it.
  properties: { color: Schema.String },
  // The handler receives `detail` decoded by the event's Schema. Invalid
  // `detail` is logged with `console.error` and sends no message.
  events: { "color-changed": Schema.Struct({ value: Schema.String }) }
})

// Shoelace's `<sl-tooltip>` has a `content` property. `content` is a name
// the builder already uses for its children, so it gets no method of its
// own and is set with `.prop("content", text)`, which is typed the same way.
// The same goes for `id`, `class`, `style`, `key` and `ref`.
export const Tooltip = Html.customElement({
  tag: "sl-tooltip",
  properties: {
    content: Schema.String,
    placement: Schema.Literals(["top", "right", "bottom", "left"])
  }
})

// ---------------------------------------------------------------------------
// A view sets properties and maps events to its messages
// ---------------------------------------------------------------------------

// The event is a fact about the element, so its message is named for what
// the user did, as for a click.
const BrandMessage = UiSchema.TaggedEnum({
  PickedColor: { color: Schema.String }
})

// `ColorPicker(h)` takes the view's `h`, which fixes the handler's message
// type, and only compiles in an HTML view. It returns an HTML element
// builder, so `.class`, `.attr`, `.children` and the native events chain
// with the property methods.
export const BrandColor = Html.component({
  name: "BrandColor",
  model: Schema.Struct({ color: Schema.String }),
  message: BrandMessage
}).make({
  init: () => ({ color: "#4f46e5" }),
  update: {
    PickedColor: ($, { color }) => $.evolve({ color: () => color })
  },
  view: (h, model) =>
    h.section(
      Tooltip(h)
        .prop("content", "Used for links and buttons")
        .placement("top")
        .children(
          // The picker gets the Model's color on every render, but the host
          // writes the property only when it changes, so dragging the picker
          // isn't interrupted. `value`, `checked`, `selected` and `open`
          // are plain properties on a custom element too: the host doesn't
          // hold them to the view's value as it does on an `<input>`.
          ColorPicker(h)
            .attr("aria-label", "Brand color")
            .color(model.color)
            .on("color-changed", ({ value }) =>
              BrandMessage.PickedColor({ color: value }))
        ),
      h.output(model.color)
    )
})

// The server renders the tags and their attributes, never their properties,
// since a property can hold any value. When the page hydrates, the browser
// host adopts the server's elements and sets the properties on them.

// ---------------------------------------------------------------------------
// A scene fires the element's event with a typed detail
// ---------------------------------------------------------------------------

// `fireElement` takes the binding, so the event name and the detail are
// checked against its Schemas. The detail is what the element would send, and
// the handler gets it decoded, as in the browser. `HtmlPlay` has the same
// step for whole-app tests.
export const picked = Effect.gen(function*() {
  const s = yield* HtmlScene.make(BrandColor, {})
  s.fireElement(
    ColorPicker,
    Locator.tag("hex-color-picker"),
    "color-changed",
    { value: "#db2777" }
  )
    .expect(Locator.tag("output"))
    .toHaveText("#db2777")
})

// ---------------------------------------------------------------------------
// Publishing a component as a custom element
// ---------------------------------------------------------------------------

// Emissions must be tagged. Each is dispatched on the element as a bubbling,
// composed `CustomEvent` named by its lowercased `_tag`, with the emission as
// `detail`, so this one arrives as `tourbooked`.
const TourEvents = UiSchema.TaggedEnum({
  TourBooked: { unitId: Schema.String }
})

export const TourForm = Html.component({
  name: "TourForm",
  props: Schema.Struct({ unitId: Schema.String, compact: Schema.Boolean }),
  model: Schema.Null,
  message: Schema.Literal("Book"),
  events: TourEvents
}).make({
  init: () => null,
  update: ($) => $.emit(TourEvents.TourBooked({ unitId: $.props.unitId })),
  view: (h) => h.button.on("click", "Book").children("Book a tour")
})

// Defines `<unit-tour-form>` while the Layer is built. Each key of `props` is
// also an element property, and `attributes` decodes kebab-case attributes,
// so `unit-id="u1"` sets `unitId`. Either write updates the props and keeps
// the Model. An instance unmounts when it's removed from the page, not when
// it's moved.
export const TourFormElement = BrowserHost.defineElement(
  "unit-tour-form",
  TourForm,
  {
    props: { unitId: "", compact: false },
    attributes: { unitId: Schema.String },
    // Optional: a shadow root, with styles page CSS can't reach.
    shadow: { styles: ["button { font: inherit; }"] }
  }
)

// In the entry module of the page that uses the element.
Layer.launch(TourFormElement).pipe(Effect.runFork)
