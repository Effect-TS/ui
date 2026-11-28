// @vitest-environment happy-dom
import { HtmlLocator, HtmlScene } from "@effect/ui/html/testing"
import { Locator, Scene, TestHost } from "@effect/ui/testing"
import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { Confirm } from "./fixtures/confirm.ts"
import { Menu } from "./fixtures/popover.ts"
import { TodoApp, TodoAppMessage, TodoItem } from "./fixtures/todos.ts"

const el = (
  tag: string,
  attrs: Record<string, string> = {},
  ...children: ReadonlyArray<Locator.Node>
): Locator.Node => ({ tag, attrs, children })
const text = (text: string): Locator.Node => ({ text })

describe("HtmlLocator", () => {
  describe("roles", () => {
    it("come from tags, types and attributes", () => {
      const tree = el(
        "div",
        {},
        el("a", { href: "/" }, text("Home")),
        el("a", {}, text("Not a link")),
        el("input", {}),
        el("input", { type: "checkbox" }),
        el("input", { type: "submit" }),
        el("input", { type: "hidden" }),
        el("input", { type: "search", list: "options" }),
        el("select", {}),
        el("select", { multiple: "" }),
        el("img", { alt: "" }),
        el("div", { role: "alert  status" }),
        el("ul", {}, el("li", {}))
      )
      const roles = Locator.elements(tree).map((node) =>
        HtmlLocator.roleOf(tree, node)
      )
      expect(roles).toEqual([
        undefined,
        "link",
        undefined,
        "textbox",
        "checkbox",
        "button",
        undefined,
        "combobox",
        "combobox",
        "listbox",
        "presentation",
        "alert",
        "list",
        "listitem"
      ])
    })

    it("header and footer are landmarks outside sectioning elements only", () => {
      const tree = el(
        "div",
        {},
        el("header", {}),
        el("article", {}, el("header", {}), el("footer", {})),
        el("footer")
      )
      expect(HtmlLocator.queryAllByRole(tree, "banner")).toHaveLength(1)
      expect(HtmlLocator.queryAllByRole(tree, "contentinfo")).toHaveLength(1)
    })

    it("hidden elements are left out unless asked for", () => {
      const tree = el(
        "div",
        {},
        el("button", { hidden: "" }, text("A")),
        el("div", { "aria-hidden": "true" }, el("button", {}, text("B"))),
        el("button", {}, text("C"))
      )
      expect(
        HtmlLocator.queryAllByRole(tree, "button").map((node) =>
          Locator.textOf(node)
        )
      ).toEqual(["C"])
      expect(HtmlLocator.queryAllByRole(tree, "button", { hidden: true }))
        .toHaveLength(3)
    })

    it("expanded filters by explicit aria-expanded state and reports it in diagnostics", () => {
      const open = el("button", { "aria-expanded": "true" }, text("Details"))
      const closed = el("button", { "aria-expanded": "false" }, text("Details"))
      const plain = el("button", {}, text("Details"))
      const other = el("button", { "aria-expanded": "yes" }, text("Details"))
      const tree = el("div", {}, open, closed, plain, other)
      expect(
        Locator.get(
          tree,
          HtmlLocator.role("button", { name: "Details", expanded: true })
        )
      ).toBe(open)
      expect(
        Locator.get(
          tree,
          HtmlLocator.role("button", { name: "Details", expanded: false })
        )
      ).toBe(closed)
      expect(HtmlLocator.queryAllByRole(tree, "button", { name: "Details" }))
        .toEqual([open, closed, plain, other])
      expect(() =>
        HtmlLocator.getByRole(el("div", {}, plain), "button", {
          name: "Details",
          expanded: false
        })
      ).toThrow(
        "HtmlLocator: nothing has role \"button\", name \"Details\", expanded false. Roles here:\n  button \"Details\""
      )
    })

    it("inert elements and those outside the topmost modal are left out unless asked for", () => {
      const tree = el(
        "div",
        {},
        el("button", {}, text("Behind")),
        {
          tag: "dialog",
          props: { open: "modal" },
          children: [
            el("section", { inert: "" }, el("button", {}, text("Delete"))),
            {
              tag: "section",
              props: { inert: true },
              children: [el("button", {}, text("Archive"))]
            },
            el("button", {}, text("Inside"))
          ]
        }
      )
      expect(
        HtmlLocator.queryAllByRole(tree, "button").map((node) =>
          Locator.textOf(node)
        )
      ).toEqual(["Inside"])
      expect(HtmlLocator.queryAllByRole(tree, "button", { hidden: true }))
        .toHaveLength(4)
    })

    it("DOM queries and actions follow the flat tree through shadow hosts and slots, and a modal in a shadow root blocks the rest", () => {
      const app = document.body.appendChild(document.createElement("div"))
      const clicked: Array<string> = []
      const button = (parent: ParentNode, name: string, tag = "button") => {
        const button = parent.appendChild(document.createElement(tag))
        button.addEventListener("click", () => clicked.push(name))
        return button
      }
      const host = (parent: ParentNode, html = "") => {
        const host = parent.appendChild(document.createElement("div"))
        host.attachShadow({ mode: "open" }).innerHTML = html
        return host
      }
      const inertHost = host(app)
      inertHost.inert = true
      button(host(app, "<section inert><slot></slot></section>"), "Slotted")
      expect(HtmlLocator.queryAllByRole(app, "button")).toEqual([])
      expect(() => HtmlLocator.click(button(inertHost.shadowRoot!, "A")))
        .toThrow("HtmlLocator.click: the element is inert")
      const link = app.appendChild(document.createElement("a"))
      link.href = "#here"
      HtmlLocator.click(button(link, "Link", "span"))
      const modalHost = host(app, "<dialog><slot></slot></dialog>")
      const dialog = modalHost.shadowRoot!.querySelector("dialog")!
      dialog.showModal()
      // happy-dom never matches `:modal`; a browser does here.
      const matches = dialog.matches.bind(dialog)
      dialog.matches =
        ((selector: string) =>
          selector === ":modal" || matches(selector)) as typeof dialog.matches
      const behind = button(app, "Behind")
      const inModal = button(modalHost, "In modal")
      expect(HtmlLocator.queryAllByRole(document, "button")).toEqual([inModal])
      expect(() => HtmlLocator.click(behind)).toThrow("is inert")
      HtmlLocator.click(inModal)
      expect(clicked).toEqual(["Link", "In modal"])
      app.remove()
    })

    it.effect("a closed dialog and what's in it are hidden, and dialogState tells closed, open and modal apart", () =>
      Effect.gen(function*() {
        const dialog = HtmlLocator.role("dialog", { name: "Delete note?" })
        const keep = HtmlLocator.role("button", { name: "Keep" })
        const scene = yield* Scene.make(Confirm, {
          state: "closed",
          acceptEscape: false
        })
        expect(scene.query(dialog)).toBeUndefined()
        expect(scene.query(keep)).toBeUndefined()
        expect(
          HtmlLocator.dialogState(
            scene.get(HtmlLocator.role("dialog", { hidden: true }))
          )
        ).toBe("closed")
        scene.click("Ask")
        expect(HtmlLocator.dialogState(scene.get(dialog))).toBe("modal")
        expect(scene.query(keep)).toBeDefined()
        // Escape is rejected by `update`, so the dialog stays modal.
        scene.fire(dialog, "cancel")
        expect(HtmlLocator.dialogState(scene.get(dialog))).toBe("modal")
        const open = yield* TestHost.mount(Confirm, {
          state: "open" as const,
          acceptEscape: false
        })
        expect(HtmlLocator.dialogState(open.get(dialog))).toBe("open")
        // A static `open` attribute counts too.
        expect(HtmlLocator.dialogState(el("dialog", { open: "" }))).toBe("open")
        expect(HtmlLocator.dialogState(document.createElement("dialog"))).toBe(
          "closed"
        )
      }).pipe(Effect.scoped, Effect.provide(TestHost.layer())))

    it("a dialog shown as a popover is visible though its open is false; hidden attributes still hide", () => {
      const dialog = (
        attrs: Record<string, string>,
        props: Record<string, unknown>,
        label: string
      ) => ({
        tag: "dialog",
        attrs: { "aria-label": label, ...attrs },
        props,
        children: [{ tag: "button", children: [text(label)] }]
      })
      const tree = el(
        "div",
        {},
        dialog({ popover: "manual" }, { popoverOpen: true }, "As popover"),
        dialog({ popover: "manual" }, { popoverOpen: false }, "Popover closed"),
        dialog({}, { open: false }, "Closed"),
        dialog({}, { open: true }, "Open"),
        dialog(
          { popover: "manual", hidden: "" },
          { popoverOpen: true },
          "Hidden"
        )
      )
      const names = (role: string) =>
        HtmlLocator.queryAllByRole(tree, role).map((node) =>
          HtmlLocator.nameOf(tree, node)
        )
      expect(names("dialog")).toEqual(["As popover", "Open"])
      expect(names("button")).toEqual(["As popover", "Open"])
      expect(HtmlLocator.queryAllByRole(tree, "dialog", { hidden: true }))
        .toHaveLength(5)
    })

    it.effect("a popover that isn't showing and what's in it are hidden, and popoverState tells", () =>
      Effect.gen(function*() {
        const menu = HtmlLocator.role("menu", { name: "Menu" })
        const rename = HtmlLocator.role("button", { name: "Rename" })
        const scene = yield* Scene.make(Menu, {
          mode: "auto",
          open: false,
          follow: true
        })
        expect(scene.query(menu)).toBeUndefined()
        expect(scene.query(rename)).toBeUndefined()
        expect(
          HtmlLocator.popoverState(
            scene.get(HtmlLocator.role("menu", { hidden: true }))
          )
        ).toBe("closed")
        // A parent opening it, as `Set` would: nothing in the view sends that.
        scene.given((model) => ({ ...model, open: true }))
        expect(HtmlLocator.popoverState(scene.get(menu))).toBe("open")
        // A light dismiss, as the browser host reports it; the Model follows.
        scene.fire(menu, "toggle", {
          open: false,
          newState: "closed",
          oldState: "open"
        })
        expect(scene.query(menu)).toBeUndefined()
        const root = yield* TestHost.mount(Menu, {
          mode: "manual" as const,
          open: true,
          follow: false
        })
        expect(HtmlLocator.popoverState(root.get(menu))).toBe("open")
        expect(HtmlLocator.popoverState(document.createElement("div"))).toBe(
          "closed"
        )
      }).pipe(Effect.scoped, Effect.provide(TestHost.layer())))
  })

  describe("names", () => {
    it("follow the accessible name order", () => {
      const tree = el(
        "form",
        {},
        el("span", { id: "first" }, text("First")),
        el("span", { id: "last" }, text("name")),
        el("input", {
          "aria-labelledby": "first last",
          "aria-label": "ignored"
        }),
        el("input", { "aria-label": "  Search   site " }),
        el("label", { for: "email" }, text("Email")),
        el("input", { id: "email", title: "ignored" }),
        el(
          "label",
          {},
          el("input", { type: "checkbox" }),
          text(" Remember me")
        ),
        el("input", { type: "submit" }),
        el("input", { type: "button", value: "Go" }),
        el("button", {}, el("img", { alt: "Close" })),
        el("button", { title: "Menu" }),
        el("input", { placeholder: "Notes" }),
        el("fieldset", {}, el("legend", {}, text("Address"))),
        el("h2", {}, text("Section "), el("em", {}, text("two")))
      )
      const names = HtmlLocator.queryAllByRole(tree, "textbox").map((node) =>
        HtmlLocator.nameOf(tree, node)
      )
      expect(names).toEqual(["First name", "Search site", "Email", "Notes"])
      expect(HtmlLocator.nameOf(tree, HtmlLocator.getByRole(tree, "checkbox")))
        .toBe("Remember me")
      expect(
        HtmlLocator.queryAllByRole(tree, "button").map((node) =>
          HtmlLocator.nameOf(tree, node)
        )
      ).toEqual([
        "Submit",
        "Go",
        "Close",
        "Menu"
      ])
      expect(HtmlLocator.nameOf(tree, HtmlLocator.getByRole(tree, "group")))
        .toBe("Address")
      expect(
        HtmlLocator.getByRole(tree, "heading", {
          name: "Section two",
          level: 2
        })
      ).toBeDefined()
      expect(HtmlLocator.getByRole(tree, "heading", { name: /two$/ }))
        .toBeDefined()
    })

    it("a label that both wraps and names a control counts once", () => {
      const container = document.createElement("div")
      container.innerHTML =
        `<label for="agreed">Agree <input id="agreed" type="checkbox"></label>`
      expect(HtmlLocator.getByRole(container, "checkbox", { name: "Agree" }))
        .toBeDefined()
    })

    it("associated labels name buttons ahead of their content, behind ARIA names", () => {
      const container = document.createElement("div")
      container.innerHTML = `
        <label>Notifications <button role="switch" aria-checked="false"></button></label>
        <label for="theme">Theme</label><button id="theme">Dark</button>
        <label for="mute">Sound</label><button id="mute" aria-label="Mute">Off</button>
        <span id="help-name">Help</span><label for="help">Ignored</label><button id="help" aria-labelledby="help-name">?</button>
        <label for="volume">Sound <button>Reset</button></label><input id="volume">
        <label>Start <button id="go">Go</button></label><label for="go">later</label>`
      expect(
        HtmlLocator.getByRole(container, "switch", { name: "Notifications" })
      ).toBeDefined()
      expect(
        HtmlLocator.queryAllByRole(container, "button").map((node) =>
          HtmlLocator.nameOf(container, node)
        )
      ).toEqual(["Theme", "Mute", "Help", "Reset", "Start later"])
    })

    it("getByRole lists what's there when nothing matches", () => {
      const tree = el(
        "div",
        {},
        el("button", {}, text("Save")),
        el("a", { href: "/" }, text("Home"))
      )
      expect(() => HtmlLocator.getByRole(tree, "button", { name: "Cancel" }))
        .toThrow(
          "HtmlLocator: nothing has role \"button\", name \"Cancel\". Roles here:\n  button \"Save\"\n  link \"Home\""
        )
      expect(() =>
        HtmlLocator.getByRole(el("div", {}, el("p"), el("p")), "paragraph")
      ).toThrow("2 elements")
    })
  })

  describe("trees", () => {
    it("a structural tree tens of thousands of levels deep", () => {
      const button = el("button", {}, text("OK"))
      let wrapped: Locator.Node = button
      for (let depth = 0; depth < 30_000; depth++) {
        wrapped = { children: [wrapped] }
      }
      expect(Locator.get(el("div", {}, wrapped), Locator.text("OK")))
        .toBe(button)
    })

    it.effect("a scene's view value, field values included", () =>
      Effect.gen(function*() {
        const scene = yield* HtmlScene.make(TodoApp, {})
        scene.type(HtmlLocator.role("textbox", { name: "New todo" }), "Read")
        // `.value(text)` sets a property, so the attributes don't hold it.
        const field = scene.get(
          HtmlLocator.role("textbox", { name: "New todo" })
        )
        expect(field.attrs?.value).toBeUndefined()
        expect(HtmlLocator.value(field)).toBe("Read")
        const item = yield* Scene.make(TodoItem, {
          todo: { id: "1", title: "Read", done: true }
        })
        expect(
          HtmlLocator.checked(
            item.get(HtmlLocator.role("checkbox", { name: "Read" }))
          )
        ).toBe(true)
        expect(HtmlLocator.checked(item.get(HtmlLocator.role("button"))))
          .toBeUndefined()
        expect(
          HtmlLocator.getByRole(scene.root, "button", { name: "Clear done" })
        ).toBeDefined()
        expect(
          scene.all(
            Locator.inside(Locator.tag("form"), HtmlLocator.role("button"))
          )
        ).toHaveLength(1)
      }))

    it.effect("a TestHost tree, checked state included", () =>
      Effect.gen(function*() {
        const root = yield* TestHost.mount(TodoApp, {})
        root.send(TodoAppMessage.Draft({ value: "Read" }))
        root.send(TodoAppMessage.Add())
        yield* TestHost.settle
        const box = HtmlLocator.getByRole(root.container, "checkbox", {
          name: "Read",
          checked: false
        })
        expect(HtmlLocator.checked(box)).toBe(false)
        Locator.fire(box as TestHost.TestElement, "input", {
          value: "on",
          checked: true
        })
        yield* TestHost.settle
        expect(HtmlLocator.checked(box)).toBe(true)
        expect(
          HtmlLocator.value(
            root.get(HtmlLocator.role("textbox", { name: "New todo" }))
          )
        ).toBe("")
        expect(
          HtmlLocator.queryAllByRole(root.container, "checkbox", {
            checked: true
          })
        ).toEqual([box])
        expect(root.all(HtmlLocator.role("listitem"))).toHaveLength(1)
      }).pipe(Effect.scoped, Effect.provide(TestHost.layer())))

    it("roots that aren't elements: a document, a fragment, a structural wrapper", () => {
      const doc = document.implementation.createHTMLDocument("")
      doc.body.innerHTML = "<button>One</button>"
      const fragment = document.createDocumentFragment()
      fragment.append(document.createElement("button"))
      const wrapper: Locator.Node = {
        children: [el("button", {}, text("Two"))]
      }
      expect(
        HtmlLocator.queryAllByRole(doc, "button").map((node) =>
          node.textContent
        )
      ).toEqual(["One"])
      expect(HtmlLocator.queryAllByRole(fragment, "button")).toHaveLength(1)
      expect(HtmlLocator.getByRole(wrapper, "button", { name: "Two" })).toBe(
        wrapper.children![0]
      )
    })

    it("the DOM", () => {
      const container = document.createElement("div")
      container.innerHTML = `
        <nav aria-label="Main"><a href="/a">A</a><a href="/b">B</a></nav>
        <label>Agree <input type="checkbox" checked></label>
        <table><caption>Totals</caption><tr><th>Item</th><td>3</td></tr></table>`
      expect(
        HtmlLocator.queryAllByRole(container, "link").map((node) =>
          node.textContent
        )
      ).toEqual(["A", "B"])
      expect(
        HtmlLocator.getByRole(container, "navigation", { name: "Main" })
          .localName
      ).toBe("nav")
      const box = HtmlLocator.getByRole(container, "checkbox", {
        name: "Agree",
        checked: true
      }) as HTMLInputElement
      box.checked = false
      expect(
        HtmlLocator.queryAllByRole(container, "checkbox", { checked: true })
      ).toEqual([])
      expect(HtmlLocator.checked(box)).toBe(false)
      const field = document.createElement("input")
      field.setAttribute("value", "first")
      expect(HtmlLocator.value(field)).toBe("first")
      // The property wins over the attribute, as the user typed it.
      field.value = "typed"
      expect(HtmlLocator.value(field)).toBe("typed")
      expect(
        HtmlLocator.nameOf(container, HtmlLocator.getByRole(container, "table"))
      ).toBe("Totals")
      expect(HtmlLocator.getByRole(container, "columnheader", { name: "Item" }))
        .toBeDefined()
      expect(HtmlLocator.getByRole(container, "cell", { name: "3" }))
        .toBeDefined()
    })
  })
})
