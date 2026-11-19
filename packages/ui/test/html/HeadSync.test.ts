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

/** A host from modules loaded fresh, so nothing has loaded HtmlHead when it is made. */
const freshHost = async () => {
  vi.resetModules()
  const BrowserHost = await import("@effect/ui/html/BrowserHost")
  const warnings: Array<string> = []
  const host = BrowserHost.makeHost(document, { warn: (message) => warnings.push(message) })
  hosts.push(host)
  return { apply: host.head!, dispose: host.dispose, warnings }
}

const titled = (title: string): HtmlHeadModule.HtmlHead => ({
  title,
  meta: [],
  links: [],
  jsonLd: [],
  html: { lang: undefined, dir: undefined, class: [], data: {} },
  body: { class: [], data: {} }
})

// Every test syncs the one global document.
describe("BrowserHost head before HtmlHead is loaded", { concurrent: false }, () => {
  it("syncs the title, and warns once about the entries it leaves out", async () => {
    document.title = "Shell"
    const { apply, dispose, warnings } = await freshHost()
    const head: HtmlHeadModule.HtmlHead = {
      ...titled("App"),
      meta: [{ _tag: "Meta", key: undefined, name: "description", property: undefined, content: "About" }]
    }
    apply(head)
    apply(head)
    expect(document.title).toBe("App")
    expect(document.head.querySelector("meta")).toBeNull()
    expect(warnings.length).toBe(1)
    dispose()
    expect(document.title).toBe("Shell")
  })

  it("leaves the server's marked tags for the sync HtmlHead brings, which adopts them", async () => {
    document.head.innerHTML = `<title data-eui>Ada</title><meta name="description" content="About Ada" data-eui>`
    const meta = document.head.querySelector("meta")
    const { apply, warnings } = await freshHost()
    apply(titled("Ada"))
    expect(document.head.querySelector("meta")).toBe(meta)
    expect(warnings.length).toBe(1)

    const HtmlHead = await import("@effect/ui/html/HtmlHead")
    apply({ ...titled("Ada"), meta: [HtmlHead.meta({ name: "description", content: "About Ada" })] })
    expect(document.head.querySelector("meta")).toBe(meta)
    expect(document.head.children.length).toBe(2)

    // The adopted tag is the framework's: a head without it removes it.
    apply(titled("Ada"))
    expect(document.head.querySelector("meta")).toBeNull()
    expect(warnings.length).toBe(1)
  })
})
