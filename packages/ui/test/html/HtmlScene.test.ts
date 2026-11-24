// @vitest-environment happy-dom
import { Mount, UiSchema } from "@effect/ui"
import { BrowserHost, Html } from "@effect/ui/html"
import { HtmlLocator, HtmlScene } from "@effect/ui/html/testing"
import { Locator } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Cause, Effect, Schema } from "effect"
import { Settings } from "./fixtures/settings.ts"

const Board = Html.component({
  name: "Board",
  model: Schema.Array(Schema.String),
  message: Schema.String
}).make({
  init: (): ReadonlyArray<string> => [],
  update: ($, message) => [...$.model, message],
  view: (h, log) =>
    h.section.onDrop(
      ({ data, files }) =>
        `outer ${
          data["application/x-todo"] ?? files.map((file) => file.name).join(",")
        }`,
      { accepts: ["application/x-todo", "Files"] }
    ).children(
      h.div.attr("aria-label", "Inner")
        .onDrop(() => "inner", { accepts: ["text/uri-list"] }).children(
          h.p("Inner child")
        ),
      h.p("Plain"),
      h.output(log.join("|"))
    )
})

const log = Locator.tag("output")

describe("HtmlScene", () => {
  it.effect("drop goes to the innermost target that accepts the drag, and throws when none does", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(Board, {})
      // The inner target doesn't accept a todo, so the outer one takes it.
      scene.drop(Locator.text("Inner child"), {
        data: { "application/x-todo": "milk" }
      })
      assert.isTrue(scene.defaultPrevented)
      scene.drop(Locator.text("Inner child"), {
        data: { "text/uri-list": "https://example.com" }
      })
        .drop(Locator.text("Plain"), { files: [new File(["x"], "a.txt")] })
        .expect(log).toHaveText("outer milk|inner|outer a.txt")
      assert.throws(
        () =>
          scene.drop(Locator.text("Plain"), {
            data: { "text/plain": "hello" }
          }),
        /HtmlScene\.drop: nothing at text "Plain" accepts "text\/plain"/
      )
    }))

  it("a message step reports unacknowledged work before a lookup that fails", () => {
    const missing = Locator.text("Missing")
    const steps: Record<
      string,
      (scene: HtmlScene.Steps<typeof Board>) => unknown
    > = {
      click: (scene) => scene.click(missing),
      fire: (scene) => scene.fire(missing, "click"),
      type: (scene) => scene.type(missing, "x"),
      change: (scene) => scene.change(missing, "x"),
      compositionEnd: (scene) => scene.compositionEnd(missing),
      keydown: (scene) => scene.keydown(missing, "a"),
      submit: (scene) => scene.submit(missing),
      focus: (scene) => scene.focus(missing),
      blur: (scene) => scene.blur(missing),
      drop: (scene) =>
        scene.drop(missing, { data: { "application/x-todo": "milk" } }),
      childEmit: (scene) => scene.childEmit(Board, "none", undefined as never),
      childFailure: (scene) =>
        scene.childFailure(Board, "none", Cause.fail("boom"))
    }
    for (const [name, run] of Object.entries(steps)) {
      const scene = HtmlScene.start(Board, {}).click("Plain")
      assert.throws(
        () => run(scene),
        new RegExp(
          `^HtmlScene\\.${name}: earlier work isn't settled or acknowledged`
        )
      )
      scene.expectIgnored()
      assert.throws(
        () => run(scene),
        new RegExp(`^HtmlScene\\.${name}: (nothing matches|no child)`)
      )
    }
  })

  it.effect("a scene names a mount by its definition, checks its args and ends it with the definition's result", () =>
    Effect.gen(function*() {
      const Message = UiSchema.TaggedEnum({
        Add: { point: Schema.Number },
        Drawn: { width: Schema.Number }
      })
      const DrawChart = Mount.make(
        "DrawChart",
        { args: { points: Schema.Array(Schema.Number) } },
        (canvas: HTMLCanvasElement) => Effect.sync(() => canvas.width)
      )
      const Chart = Html.component({
        name: "Chart",

        model: Schema.Struct({
          points: Schema.Array(Schema.Number),
          width: Schema.Number
        }),

        message: Message
      }).make({
        init: () => ({ points: [1, 2], width: 0 }),
        update: ($, message) =>
          Message.match(message, {
            Add: ({ point }) => ({
              ...$.model,
              points: [...$.model.points, point]
            }),
            Drawn: ({ width }) => ({ ...$.model, width })
          }),
        view: (h, model) =>
          h.div(
            h.canvas.onMount(
              DrawChart({ points: model.points }).pipe(
                Mount.map((width) => Message.Drawn({ width }))
              )
            ),
            h.button.onClick(Message.Add({ point: 3 })).children("Add"),
            h.p(`width ${model.width}`)
          )
      })
      const scene = yield* HtmlScene.make(Chart, {})
      scene.expectMount(DrawChart({ points: [1, 2] }))
        .click("Add")
        // The mount keeps running with the new args.
        .expectMount(DrawChart({ points: [1, 2, 3] }))
        // The definition's own result: the view's Mount.map makes the message.
        .mounted(DrawChart, 300)
        .expect(Locator.tag("p")).toHaveText("width 300")
      assert.throws(
        () => scene.expectMount(DrawChart({ points: [] })),
        /HtmlScene\.expectMount: no rendered mount matches DrawChart\(\{"points":\[\]\}\); mounts: DrawChart\(\{"points":\[1,2,3\]\}\)/
      )
    }))

  it.effect("type, keydown, label and placeholder send what the browser host sends", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(Settings, {})
      scene.type(HtmlLocator.label("Zip code"), "10001")
        .expect(HtmlLocator.placeholder("90210")).toHaveValue("10001")
        .keydown(HtmlLocator.label("Zip code"), "Enter", { shift: true })
        .expect(log).toHaveText("zip:10001|key:Enter+shift")
    }))

  it("type, change, compositionEnd and keydown default the edit, the composition and the selection, and take them", () => {
    const Field = Html.component({
      name: "Field",
      model: Schema.Array(Schema.String),
      message: Schema.String
    }).make({
      init: (): ReadonlyArray<string> => [],
      update: ($, message) => [...$.model, message],
      view: (h, log) => {
        const saw = (event: string) => (payload: object) =>
          `${event} ${JSON.stringify(payload)}`
        return h.div(
          h.input.attr("aria-label", "Name").value("Ada").onInput(saw("input"))
            .onChange(saw("change"))
            .onCompositionEnd(saw("compositionend")).onKeyDown(saw("keydown")),
          h.input.prop("type", "checkbox").attr("aria-label", "PropBox")
            .onKeyDown(saw("keydown")),
          h.div.attr("contenteditable", "true").onKeyDown(saw("keydown"))
            .children(
              h.span.attr("id", "ce-child").children("Edit"),
              h.div.attr("contenteditable", "false").children(
                h.button.attr("id", "ce-island-btn").children("Stop")
              )
            ),
          h.output(log.join("\n"))
        )
      }
    })
    const name = HtmlLocator.label("Name")
    const propBox = HtmlLocator.label("PropBox")
    const scene = HtmlScene.start(Field, {})
      .type(name, "A")
      .type(name, "Ad", { composing: true, inputType: "insertCompositionText" })
      .compositionEnd(name, "Adam")
      .compositionEnd(name)
      .change(name, "Ada")
      .change(name, { inputType: "insertReplacementText" })
      .keydown(name, "a")
      .keydown(name, "a", {
        composing: true,
        repeat: true,
        editable: false,
        selectionStart: 1,
        selectionEnd: 3
      })
      .keydown(propBox, " ")
      .keydown(Locator.attr("id", "ce-child"), "g")
      .keydown(Locator.attr("id", "ce-island-btn"), "g")
    assert.deepStrictEqual(
      scene.get(log).children?.map((child) => child.text).join("").split("\n"),
      [
        `input {"value":"A","checked":false,"files":[],"composing":false,"inputType":"insertText"}`,
        `input {"value":"Ad","checked":false,"files":[],"composing":true,"inputType":"insertCompositionText"}`,
        `compositionend {"value":"Adam"}`,
        `compositionend {"value":"Ada"}`,
        `change {"value":"Ada","checked":false,"files":[],"composing":false,"inputType":""}`,
        `change {"value":"Ada","checked":false,"files":[],"composing":false,"inputType":"insertReplacementText"}`,
        `keydown {"key":"a","shift":false,"ctrl":false,"alt":false,"meta":false,"composing":false,"repeat":false,"editable":true,"selectionStart":null,"selectionEnd":null}`,
        `keydown {"key":"a","shift":false,"ctrl":false,"alt":false,"meta":false,"composing":true,"repeat":true,"editable":false,"selectionStart":1,"selectionEnd":3}`,
        `keydown {"key":" ","shift":false,"ctrl":false,"alt":false,"meta":false,"composing":false,"repeat":false,"editable":false,"selectionStart":null,"selectionEnd":null}`,
        `keydown {"key":"g","shift":false,"ctrl":false,"alt":false,"meta":false,"composing":false,"repeat":false,"editable":true,"selectionStart":null,"selectionEnd":null}`,
        `keydown {"key":"g","shift":false,"ctrl":false,"alt":false,"meta":false,"composing":false,"repeat":false,"editable":false,"selectionStart":null,"selectionEnd":null}`
      ]
    )
  })

  it.effect("change with files sends them to a file input's change, and other inputs get none", () =>
    Effect.gen(function*() {
      const Message = UiSchema.TaggedEnum({
        Changed: { names: Schema.Array(Schema.String) }
      })
      const Upload = Html.component({
        name: "Upload",
        model: Schema.Array(Schema.String),
        message: Message
      }).make({
        init: (): ReadonlyArray<string> => [],
        update: ($, { names }) => [...$.model, names.join(",")],
        view: (h, log) =>
          h.div(
            h.input.attrs({ type: "file", "aria-label": "File" }).value("")
              .onChange(({ files }) =>
                Message.Changed({ names: files.map((file) => file.name) })
              ),
            h.input.attr("aria-label", "Name").onChange(({ files }) =>
              Message.Changed({ names: [`${files.length}`] })
            ),
            h.output(log.join(" | "))
          )
      })
      const scene = yield* HtmlScene.make(Upload, {})
      scene.change(HtmlLocator.label("File"), {
        files: [new File(["a"], "a.txt"), new File(["b"], "b.txt")]
      })
        .change(HtmlLocator.label("Name"), {
          value: "Ada",
          files: [new File(["c"], "c.txt")]
        })
        .expect(Locator.text("a.txt,b.txt | 0")).toExist()
    }))

  it.effect("a submit button submits its form with the fields read from the view", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(Settings, {})
      scene.type(HtmlLocator.label("Zip code"), "10001")
        .click(HtmlLocator.role("checkbox", { name: "Agree" }))
        .click(HtmlLocator.role("button", { name: "Go" }))
        // The disabled checkbox is left out, the submitter is in.
        .expect(log).toHaveText(
          "zip:10001|agree:true|submit:zip=10001&agree=on&via=go"
        )
        // Submitting without a submitter.
        .submit(HtmlLocator.label("Zip code"))
        .expect(log).toHaveText(/\|submit:zip=10001&agree=on$/)
    }))

  it.effect("a checkbox fires input and change, and the matchers read fields", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(Settings, {})
      scene.expect(HtmlLocator.label("Agree")).toBeChecked(false)
        .click(HtmlLocator.label("Agree"))
        .expect(HtmlLocator.label("Agree")).toBeChecked()
        .click(HtmlLocator.label("Agree"))
        .expect(log).toHaveText("agree:true|agree:false")
        .expect(HtmlLocator.label("Off")).toBeDisabled()
        .expect(HtmlLocator.label("Agree")).toBeDisabled(false)
        .expect(HtmlLocator.label("Zip code")).toHaveAccessibleName("Zip code")
      const started = HtmlScene.start(Settings, {})
      assert.throws(
        () => started.expect(HtmlLocator.label("Agree")).toBeChecked(),
        /toBeChecked\(\): it is unchecked/
      )
      assert.throws(
        () => started.expect(HtmlLocator.label("Agree")).toBeDisabled(),
        /toBeDisabled\(\): it is enabled/
      )
      assert.throws(
        () => started.expect(HtmlLocator.label("Zip code")).toHaveValue("1"),
        /toHaveValue\("1"\): its value is ""/
      )
      assert.throws(
        () =>
          started.expect(HtmlLocator.label("Zip code")).toHaveAccessibleName(
            "Zip"
          ),
        /toHaveAccessibleName\("Zip"\): its accessible name is "Zip code"/
      )
    }))

  it("clicking a disabled control throws", () => {
    const scene = HtmlScene.start(Settings, {})
    assert.throws(
      () => scene.click(HtmlLocator.label("Off")),
      /^HtmlScene\.click: label "Off" is disabled/
    )
    assert.throws(
      () => scene.click("Later"),
      /^HtmlScene\.click: text "Later" is disabled/
    )
  })

  it.effect("click, type and keydown send what BrowserHost sends for the same actions", () =>
    Effect.gen(function*() {
      const app = yield* Effect.acquireRelease(
        Effect.sync(() =>
          document.body.appendChild(document.createElement("div"))
        ),
        (element) => Effect.sync(() => element.remove())
      )
      yield* BrowserHost.mountEffect(Settings, {}, app)
      const zip = HtmlLocator.getByRole(app, "textbox", {
        name: "Zip code"
      }) as HTMLInputElement
      HtmlLocator.type(zip, "10001")
      zip.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          shiftKey: true,
          bubbles: true
        })
      )
      HtmlLocator.click(
        HtmlLocator.getByRole(app, "checkbox", { name: "Agree" })
      )
      HtmlLocator.click(HtmlLocator.getByRole(app, "button", { name: "Go" }))
      yield* Effect.promise(() =>
        new Promise<void>((resolve) => setTimeout(resolve, 30))
      )
      const browser = app.querySelector("output")!.textContent
      const scene = yield* HtmlScene.make(Settings, {})
      scene.type(HtmlLocator.label("Zip code"), "10001")
        .keydown(HtmlLocator.label("Zip code"), "Enter", { shift: true })
        .click(HtmlLocator.role("checkbox", { name: "Agree" }))
        .click(HtmlLocator.role("button", { name: "Go" }))
      assert.strictEqual(
        browser,
        "zip:10001|key:Enter+shift|agree:true|submit:zip=10001&agree=on&via=go"
      )
      assert.strictEqual(
        scene.get(log).children?.map((child) => child.text).join(""),
        browser
      )
    }).pipe(Effect.scoped))

  it.effect("a popovertarget button toggles its popover", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(Settings, {})
      scene.click(HtmlLocator.role("button", { name: "Menu" }))
        .expect(log).toHaveText("toggle:open")
    }))

  describe("a click's defaults", () => {
    const Checkout = Html.component({
      name: "Checkout",

      model: Schema.Struct({
        log: Schema.Array(Schema.String),
        zip: Schema.String
      }),

      message: Schema.String
    }).make({
      init: () => ({ log: [], zip: "old" }),
      update: ($, message) => ({
        log: [...$.model.log, message],
        zip: message === "fill" ? "new" : $.model.zip
      }),
      view: (h, model) =>
        h.div(
          h.form.attr("id", "f").onSubmit(({ entries }) =>
            `submit:${
              entries.map(([name, value]) => `${name}=${value}`).join("&")
            }`
          ).children(
            h.input.attrs({ name: "zip", "aria-label": "Zip" }).value(
              model.zip
            ),
            // Inside the form, but owned by another one.
            h.input.attrs({ name: "elsewhere", form: "other" }).value("x"),
            h.button.onClick("fill").children("Fill"),
            h.button.onClick("stopped", { preventDefault: true }).children(
              "Stop"
            ),
            h.input.attrs({ type: "checkbox", "aria-label": "Agree" })
              .onClick("checked?", { preventDefault: true })
              .onChange(({ checked }) => `agree:${checked}`)
          ),
          // Outside the form, owned by it through its form attribute.
          h.input.attrs({ name: "note", form: "f" }).value("hi"),
          h.button.attr("popovertarget", "menu").onClick("menu?", {
            preventDefault: true
          }).children("Menu"),
          h.div.attrs({ id: "menu", popover: "" }).onToggle(({ newState }) =>
            `toggle:${newState}`
          ),
          h.fieldset.attr("disabled", "").children(
            h.legend(
              h.button.attr("type", "button").onClick("legend").children(
                "In legend"
              )
            ),
            h.button.attr("type", "button").onClick("body").children("In body")
          ),
          h.output(model.log.join("|"))
        )
    })

    it.effect("a cancelled click runs none of them: no submit, no checkbox change, no popover toggle", () =>
      Effect.gen(function*() {
        const scene = yield* HtmlScene.make(Checkout, {})
        scene.click("Stop")
          .click(HtmlLocator.label("Agree"))
          .click("Menu")
          .expect(log).toHaveText("stopped|checked?|menu?")
      }))

    it.effect("a submit reads the fields as the click left them, by form owner", () =>
      Effect.gen(function*() {
        const scene = yield* HtmlScene.make(Checkout, {})
        scene.click("Fill")
          .expect(log).toHaveText("fill|submit:zip=new&note=hi")
      }))

    it("the first legend of a disabled fieldset stays clickable, and the rest of it doesn't", () => {
      const scene = HtmlScene.start(Checkout, {}).click("In legend").expect(log)
        .toHaveText("legend")
      assert.throws(
        () => scene.click("In body"),
        /^HtmlScene\.click: text "In body" is disabled/
      )
    })
  })
})
