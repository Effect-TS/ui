// @vitest-environment happy-dom
import type * as HtmlHeadModule from "@effect/ui/html/HtmlHead"
import { afterEach, describe, expect, it, vi } from "vitest"

const hosts: Array<{ readonly dispose: () => void }> = []

afterEach(() => {
  for (const host of hosts.splice(0)) host.dispose()
  document.head.innerHTML = ""
  document.title = ""
  for (const element of [document.documentElement, document.body]) {
    for (const name of element.getAttributeNames()) element.removeAttribute(name)
  }
})

/** A host from modules loaded fresh, by an app that imports nothing from HtmlHead. */
const freshHost = async () => {
  vi.resetModules()
  const BrowserHost = await import("@effect/ui/html/BrowserHost")
  const warnings: Array<string> = []
  const host = BrowserHost.makeHost(document, { warn: (message) => warnings.push(message) })
  hosts.push(host)
  return { apply: host.head!, warnings }
}

const description = (content: string): HtmlHeadModule.Meta => ({
  _tag: "Meta",
  key: undefined,
  name: "description",
  property: undefined,
  content
})

/** A head written as a literal, as a `reduceHead` may build one. */
const literal = (meta: ReadonlyArray<HtmlHeadModule.Meta>): HtmlHeadModule.HtmlHead => ({
  title: "App",
  meta,
  links: [],
  jsonLd: [],
  html: { lang: "en", dir: undefined, class: [], data: {} },
  body: { class: ["dark"], data: {} }
})

// Every test syncs the one global document.
describe("BrowserHost head in an app that imports nothing from HtmlHead", { concurrent: false }, () => {
  it("syncs a head written as a literal", async () => {
    const { apply, warnings } = await freshHost()
    apply(literal([description("About")]))
    expect(document.title).toBe("App")
    expect(document.head.querySelector("meta[data-eui]")?.getAttribute("content")).toBe("About")
    expect(document.documentElement.getAttribute("lang")).toBe("en")
    expect(document.body.className).toBe("dark")
    expect(warnings).toEqual([])
  })

  it("adopts the server's marked tag the head wants, and removes the one it doesn't", async () => {
    document.head.innerHTML = `<title data-eui>App</title><meta name="description" content="About" data-eui>` +
      `<meta name="robots" content="noindex" data-eui>`
    const kept = document.head.querySelector("meta[name=description]")
    const { apply, warnings } = await freshHost()
    apply(literal([description("About")]))
    expect(document.head.querySelector("meta[name=description]")).toBe(kept)
    expect(document.head.querySelector("meta[name=robots]")).toBeNull()
    expect(warnings).toEqual([])
  })
})
