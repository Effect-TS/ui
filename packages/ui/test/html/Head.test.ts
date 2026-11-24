// @vitest-environment happy-dom
import { Head, UiSchema } from "@effect/ui"
import { BrowserHost, Html, HtmlHead, HtmlServer } from "@effect/ui/html"
import type * as runtime from "@effect/ui/internal/runtime"
import { Effect, Schema } from "effect"
import { afterEach, describe, expect, it } from "vitest"

const head = (...entries: ReadonlyArray<HtmlHead.Entry>) =>
  HtmlHead.merge({ entries, children: [] })

const render = (entries: ReadonlyArray<HtmlHead.Entry>) =>
  Effect.runPromise(
    HtmlServer.renderToHtml(
      Html.component({
        name: "HeadNames",
        model: Schema.Null,
        message: Schema.Never
      })
        .make({
          init: () => null,
          update: ($) => $.model,
          head: () => entries,
          view: (h) => h.div
        }),
      {}
    )
  )

const sync = () => {
  const warnings: Array<string> = []
  const host = BrowserHost.makeHost(document, {
    warn: (message) => warnings.push(message)
  })
  hosts.push(host)
  return { apply: host.head!, warnings }
}
const hosts: Array<{ readonly dispose: () => void }> = []

afterEach(() => {
  for (const host of hosts.splice(0)) host.dispose()
  document.head.innerHTML = ""
  document.title = ""
  for (const element of [document.documentElement, document.body]) {
    for (const name of element.getAttributeNames()) {
      element.removeAttribute(name)
    }
  }
})

// Every test syncs the one global document, and hosts on a document share its sync until each is disposed.
describe("BrowserHost head", { concurrent: false }, () => {
  it("validates head tag and document data names before serialization, adoption and updates", async () => {
    const unsafe = [
      "x onclick",
      "x\"><script>alert(1)</script",
      "x'",
      "x=",
      "x/",
      "x<",
      "x>",
      "x\t",
      "x\n",
      "x\u0000"
    ]
    const injected = Object.fromEntries(
      unsafe.map((name) => [`data-${name}`, "alert(1)"])
    )
    const unsafeData = unsafe.flatMap((name) => [
      HtmlHead.htmlData(`data-${name}`, "alert(1)"),
      HtmlHead.bodyData(`data-${name}`, "alert(1)")
    ])
    const linkAttributes = {
      rel: "alternate",
      href: "/first",
      ...injected,
      HREF: "/last",
      "data-EUI": "fake"
    }
    const entries = [
      HtmlHead.link(linkAttributes),
      ...unsafeData,
      HtmlHead.htmlData("data-THEME", "first"),
      HtmlHead.htmlData("data-theme", "middle"),
      HtmlHead.htmlData("data-THEME", "a\"<&"),
      HtmlHead.bodyData("data-THEME", "first"),
      HtmlHead.bodyData("data-theme", "middle"),
      HtmlHead.bodyData("data-THEME", "a\"<&"),
      HtmlHead.htmlData("data-EUI", "fake"),
      HtmlHead.bodyData("data-EUI", "fake")
    ]
    const rendered = await render(entries)
    const invalidOnly = await render(unsafeData)
    expect(invalidOnly.htmlAttributes).toBe("")
    expect(invalidOnly.bodyAttributes).toBe("")
    expect(rendered.head).toBe(
      "<link rel=\"alternate\" href=\"/last\" data-eui>"
    )
    expect(rendered.htmlAttributes).toBe(
      "data-theme=\"a&quot;&lt;&amp;\" data-eui=\"data-theme\""
    )
    expect(rendered.bodyAttributes).toBe(rendered.htmlAttributes)
    for (const hydrate of [false, true]) {
      const target = new DOMParser().parseFromString(
        hydrate
          ? `<html ${rendered.htmlAttributes}><head>${rendered.head}</head><body ${rendered.bodyAttributes}></body></html>`
          : "<html data-theme=\"shell\"><head></head><body data-theme=\"shell\"></body></html>",
        "text/html"
      )
      const before = target.head.firstElementChild
      const warnings: Array<string> = []
      const host = BrowserHost.makeHost(target, {
        warn: (message) => warnings.push(message)
      })
      hosts.push(host)
      host.head!(head(...entries))
      const link = target.head.querySelector("link")!
      if (hydrate) expect(link).toBe(before)
      expect(link.getAttributeNames()).toEqual(["rel", "href", "data-eui"])
      expect(link.getAttribute("href")).toBe("/last")
      expect(target.querySelector("script")).toBeNull()
      for (const element of [target.documentElement, target.body]) {
        expect(element.getAttributeNames()).toEqual(["data-theme", "data-eui"])
        expect(element.getAttribute("data-theme")).toBe("a\"<&")
        expect(element.getAttribute("data-eui")).toBe("data-theme")
      }
      host.head!(
        head(
          HtmlHead.htmlData("data-THEME", "updated"),
          HtmlHead.bodyData("data-THEME", "updated")
        )
      )
      for (const element of [target.documentElement, target.body]) {
        expect(element.getAttribute("data-theme")).toBe("updated")
        expect(element.getAttribute("data-eui")).toBe("data-theme")
      }
      host.head!(HtmlHead.empty)
      expect(target.head.children.length).toBe(0)
      for (const element of [target.documentElement, target.body]) {
        expect(element.getAttribute("data-theme")).toBe(
          hydrate ? null : "shell"
        )
        expect(element.hasAttribute("data-eui")).toBe(false)
      }
      host.head!(head(...unsafeData))
      expect(target.documentElement.hasAttribute("data-eui")).toBe(false)
      expect(target.body.hasAttribute("data-eui")).toBe(false)
      expect(warnings).toEqual([])
    }
  })

  it("merges links by their normalized rel and href before rendering", async () => {
    const canonical = { rel: "alternate", href: "/first", REL: "canonical" }
    const alternate = {
      rel: "alternate",
      href: "/other",
      HREF: "/same",
      hreflang: "en"
    }
    const entries = [
      HtmlHead.link(canonical),
      HtmlHead.link({ rel: "canonical", href: "/last" }),
      HtmlHead.link(alternate),
      HtmlHead.link({ rel: "alternate", href: "/same", hreflang: "fr" })
    ]
    const rendered = await render(entries)
    expect(rendered.head).toBe(
      "<link rel=\"canonical\" href=\"/last\" data-eui><link rel=\"alternate\" href=\"/same\" hreflang=\"fr\" data-eui>"
    )
    const { apply } = sync()
    apply(head(...entries))
    expect([...document.head.querySelectorAll("link")].map((link) => [
      link.getAttribute("rel"),
      link.getAttribute("href"),
      link.getAttribute("hreflang")
    ])).toEqual([["canonical", "/last", null], ["alternate", "/same", "fr"]])
  })

  it("escapes data names in the serialized ownership marker", async () => {
    const entries = [
      HtmlHead.htmlData("data-a&copy;", "amp"),
      HtmlHead.bodyData("data-a&copy;", "amp")
    ]
    const rendered = await render(entries)
    expect(rendered.htmlAttributes).toBe(
      "data-a&copy;=\"amp\" data-eui=\"data-a&amp;copy;\""
    )
    expect(rendered.bodyAttributes).toBe(rendered.htmlAttributes)
    const { apply } = sync()
    apply(head(...entries))
    for (const element of [document.documentElement, document.body]) {
      expect(element.getAttribute("data-a&copy;")).toBe("amp")
      expect(element.getAttribute("data-eui")).toBe("data-a&copy;")
    }
    apply(HtmlHead.empty)
    expect(document.documentElement.hasAttribute("data-a&copy;")).toBe(false)
    expect(document.body.hasAttribute("data-a&copy;")).toBe(false)
  })

  it("adopts the server's marked tags, so the first sync changes nothing", () => {
    document.head.innerHTML =
      `<title>Ada</title><meta name="description" content="About Ada" data-eui>` +
      `<script type="application/ld+json" data-eui>{"name":"Ada"}</script>`
    const meta = document.head.querySelector("meta")!
    const script = document.head.querySelector("script")!
    const { apply } = sync()
    const entries = [
      Head.title("Ada"),
      HtmlHead.meta({ name: "description", content: "About Ada" }),
      HtmlHead.jsonLd({ name: "Ada" })
    ]
    apply(head(...entries))
    expect(document.head.querySelector("meta")).toBe(meta)
    expect(document.head.querySelector("script")).toBe(script)
    expect(document.head.children.length).toBe(3)

    // A JSON-LD block is rewritten only when its canonical form changes.
    apply(
      head(...entries.slice(0, 2), HtmlHead.jsonLd({ name: "Ada", born: 1815 }))
    )
    expect(document.head.querySelector("script")).not.toBe(script)
    expect(document.head.querySelector("script")!.textContent).toBe(
      "{\"born\":1815,\"name\":\"Ada\"}"
    )
    expect(document.head.querySelector("meta")).toBe(meta)
  })

  it("restores the shell's title, lang and data values and removes owned class tokens", () => {
    document.title = "Shell"
    document.documentElement.setAttribute("lang", "fr")
    document.body.setAttribute("data-theme", "light")
    document.body.className = "shell dark"
    const { apply } = sync()
    apply(head(
      Head.title("App"),
      HtmlHead.lang("en"),
      HtmlHead.dir("rtl"),
      HtmlHead.bodyClass("dark app"),
      HtmlHead.bodyData("data-theme", "dark")
    ))
    expect(document.title).toBe("App")
    expect(document.documentElement.getAttribute("lang")).toBe("en")
    expect(document.documentElement.getAttribute("data-eui")).toBe("lang dir")
    expect(document.body.className).toBe("shell dark app")
    expect(document.body.getAttribute("data-eui")).toBe("class data-theme")
    expect(document.body.getAttribute("data-theme")).toBe("dark")

    apply(HtmlHead.empty)
    expect(document.title).toBe("Shell")
    expect(document.documentElement.getAttribute("lang")).toBe("fr")
    expect(document.documentElement.hasAttribute("dir")).toBe(false)
    expect(document.documentElement.hasAttribute("data-eui")).toBe(false)
    // "dark" was the framework's once an entry contributed it.
    expect(document.body.className).toBe("shell")
    expect(document.body.getAttribute("data-theme")).toBe("light")
    expect(document.body.hasAttribute("data-eui")).toBe(false)
  })

  it("hands the shell's values to the next host once the last one is disposed", () => {
    document.title = "Shell"
    document.documentElement.setAttribute("lang", "fr")
    const first = BrowserHost.makeHost(document)
    first.head!(
      head(
        Head.title("First"),
        HtmlHead.lang("en"),
        HtmlHead.meta({ name: "description", content: "First" })
      )
    )
    first.dispose()
    expect(document.title).toBe("Shell")
    expect(document.documentElement.getAttribute("lang")).toBe("fr")
    expect(document.head.querySelector("meta")).toBeNull()
    const { apply } = sync()
    apply(head(Head.title("Second")))
    expect(document.title).toBe("Second")
    apply(HtmlHead.empty)
    expect(document.title).toBe("Shell")
  })

  it("leaves the server's head in place when a host that never synced is disposed", () => {
    document.head.innerHTML =
      `<title data-eui>Ada</title><meta name="description" content="About Ada" data-eui>`
    BrowserHost.makeHost(document).dispose()
    expect(document.title).toBe("Ada")
    expect(document.head.querySelector("meta")).not.toBeNull()
  })

  it("keeps unmarked shell tags and warns when an entry duplicates one", () => {
    document.head.innerHTML =
      `<meta name="description" content="Shell"><link rel="canonical" href="/shell">` +
      `<script type="application/ld+json">{}</script>`
    document.documentElement.setAttribute("lang", "fr")
    const { apply, warnings } = sync()
    apply(head(
      HtmlHead.meta({ name: "description", content: "App" }),
      HtmlHead.link({ rel: "canonical", href: "/app" }),
      HtmlHead.jsonLd({ a: 1 }),
      HtmlHead.lang("en")
    ))
    expect(warnings.length).toBe(4)
    expect(document.head.querySelectorAll("meta").length).toBe(2)
    apply(HtmlHead.empty)
    expect(document.head.querySelector("meta")!.getAttribute("content")).toBe(
      "Shell"
    )
    expect(document.head.querySelectorAll("[data-eui]").length).toBe(0)
  })

  it("warns when an attribute the marker lists doesn't hold the head's value", () => {
    // HTML keeps the first copy of a duplicated attribute, so the shell's class won.
    document.documentElement.setAttribute("class", "h-full")
    document.documentElement.setAttribute("data-eui", "class")
    const { apply, warnings } = sync()
    apply(head(HtmlHead.htmlClass("dark")))
    expect(warnings).toEqual([
      "Head: <html> is missing the class tokens dark the marker lists"
    ])
    expect(document.documentElement.className).toBe("h-full dark")
  })

  it("keeps managed tags in the merged order", () => {
    const { apply } = sync()
    // Stylesheets are where the order matters; happy-dom would try to load one, so these are alternates.
    const sheet = (href: string) => HtmlHead.link({ rel: "alternate", href })
    const hrefs = () =>
      [...document.head.querySelectorAll("link[data-eui]")].map((link) =>
        link.getAttribute("href")
      )
    apply(head(sheet("a.css"), sheet("b.css")))
    expect(hrefs()).toEqual(["a.css", "b.css"])
    const b = document.head.querySelector("link[href='b.css']")
    apply(head(sheet("a2.css"), sheet("b.css")))
    expect(hrefs()).toEqual(["a2.css", "b.css"])
    expect(document.head.querySelector("link[href='b.css']")).toBe(b)
    apply(head(sheet("b.css"), sheet("a2.css"), sheet("c.css")))
    expect(hrefs()).toEqual(["b.css", "a2.css", "c.css"])
    expect(document.head.querySelector("link[href='b.css']")).toBe(b)
  })

  it("warns about a duplicated shell tag whose attribute value holds quotes", () => {
    document.head.innerHTML = `<meta name='say "hi"' content="Shell">`
    const { apply, warnings } = sync()
    apply(head(HtmlHead.meta({ name: "say \"hi\"", content: "App" })))
    expect(warnings).toEqual([
      `Head: the shell has its own meta[name="say \\"hi\\""], which a head entry also sets`
    ])
  })
})

const tick = Effect.promise(() =>
  new Promise<void>((resolve) => setTimeout(resolve, 30))
)

const Rename = UiSchema.TaggedEnum({ Rename: { title: Schema.String } })

const Titled = Html.component({
  name: "Titled",
  props: Schema.Struct({ title: Schema.String }),
  model: Schema.String,
  message: Rename
}).make({
  init: ($) => $.props.title,
  update: (_, message) => message.title,
  head: (
    { model: title }
  ) => [
    Head.title(title),
    HtmlHead.meta({ name: "description", content: title })
  ],
  view: (h, title) => h.p(title)
})

const mountIn = Effect.fnUntraced(
  function*(title: string, options?: { readonly head?: boolean }) {
    const element = yield* Effect.acquireRelease(
      Effect.sync(() =>
        document.body.appendChild(document.createElement("div"))
      ),
      (element) => Effect.sync(() => element.remove())
    )
    const root = yield* BrowserHost.mountEffect(
      Titled,
      { title },
      element,
      options
    )
    return root as typeof root & runtime.Root
  }
)

describe("BrowserHost head ownership", { concurrent: false }, () => {
  it("with two mounts on one document, only the one that owns the head writes it", () =>
    Effect.runPromise(Effect.scoped(Effect.gen(function*() {
      document.title = "Shell"
      const app = yield* mountIn("App")
      const widget = yield* mountIn("Widget", { head: false })
      yield* tick
      expect(document.title).toBe("App")
      expect(
        [...document.head.querySelectorAll("meta")].map((meta) => meta.content)
      ).toEqual(["App"])
      const ownedHead = document.head.innerHTML
      widget.send(Rename.Rename({ title: "Renamed" }))
      yield* tick
      expect((widget.head() as HtmlHead.HtmlHead).title).toBe("Renamed")
      expect(document.head.innerHTML).toBe(ownedHead)
      app.send(Rename.Rename({ title: "Home" }))
      yield* tick
      expect(document.title).toBe("Home")
      expect(
        [...document.head.querySelectorAll("meta")].map((meta) => meta.content)
      ).toEqual(["Home"])
    }))))
})
