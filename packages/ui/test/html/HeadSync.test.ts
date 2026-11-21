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

const meta = (name: string, content: string): HtmlHeadModule.Meta => ({
  _tag: "Meta",
  key: undefined,
  name,
  property: undefined,
  content
})

/** A head written as a literal, as an `HtmlHead.reduce` may build one. */
const literal = (entries: ReadonlyArray<HtmlHeadModule.Meta>): HtmlHeadModule.HtmlHead => ({
  title: "App",
  meta: entries,
  links: [],
  jsonLd: [],
  html: { lang: "en", dir: undefined, class: [], data: {} },
  body: { class: ["dark"], data: {} }
})

// Every test syncs the one global document.
describe("BrowserHost head in an app that imports nothing from HtmlHead", { concurrent: false }, () => {
  it("syncs a literal head, adopts wanted server tags, and removes unwanted ones", async () => {
    document.head.innerHTML = `<title data-eui>Old</title><meta name="description" content="About" data-eui>` +
      `<meta name="robots" content="noindex" data-eui>`
    const kept = document.head.querySelector("meta[name=description]")
    const { apply, warnings } = await freshHost()
    apply(literal([meta("description", "About"), meta("author", "Ada")]))
    expect(document.title).toBe("App")
    expect(document.head.querySelector("meta[name=description]")).toBe(kept)
    expect(document.head.querySelector("meta[name=author][data-eui]")?.getAttribute("content")).toBe("Ada")
    expect(document.head.querySelector("meta[name=robots]")).toBeNull()
    expect(document.documentElement.getAttribute("lang")).toBe("en")
    expect(document.body.className).toBe("dark")
    expect(warnings).toEqual([])
  })
})
