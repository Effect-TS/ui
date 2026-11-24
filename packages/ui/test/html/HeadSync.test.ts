// @vitest-environment happy-dom
import type * as HtmlHeadModule from "@effect/ui/html/HtmlHead"
import { afterEach, describe, expect, it, vi } from "vitest"

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

/** A host from modules loaded fresh, by an app that imports HtmlHead or nothing from it. */
const freshHost = async (options?: { readonly htmlHead?: boolean }) => {
  vi.resetModules()
  if (options?.htmlHead === true) await import("@effect/ui/html/HtmlHead")
  const BrowserHost = await import("@effect/ui/html/BrowserHost")
  const warnings: Array<string> = []
  const host = BrowserHost.makeHost(document, {
    warn: (message) => warnings.push(message)
  })
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

const literal = (
  entries: ReadonlyArray<HtmlHeadModule.Meta>
): HtmlHeadModule.HtmlHead => ({
  title: "App",
  meta: entries,
  links: [],
  jsonLd: [],
  html: { lang: "en", dir: undefined, class: [], data: {} },
  body: { class: ["dark"], data: {} }
})

// Every test syncs the one global document.
describe("BrowserHost head", {
  concurrent: false
}, () => {
  it("syncs only the title in an app that imports nothing from HtmlHead, the only head it can write", async () => {
    document.head.innerHTML =
      `<title>Shell</title><meta name="robots" content="noindex">`
    const { apply, warnings } = await freshHost()
    apply({ title: "Ada" })
    expect(document.title).toBe("Ada")
    apply({ title: undefined })
    expect(document.title).toBe("Shell")
    apply({ title: "Grace" })
    expect(document.title).toBe("Grace")
    expect(document.head.querySelector("meta[name=robots]")).not.toBeNull()
    expect(warnings).toEqual([])
    hosts.splice(0).forEach((host) => host.dispose())
    expect(document.title).toBe("Shell")
  })

  it("warns once when an unmarked title shadows the marked one, without HtmlHead", async () => {
    document.head.innerHTML =
      `<title>Shell</title><title data-eui>Server</title>`
    const { apply, warnings } = await freshHost()
    apply({ title: "Ada" })
    apply({ title: "Grace" })
    expect(warnings).toEqual([
      "Head: an unmarked <title> comes before the marked one, so the browser shows the shell's"
    ])
  })

  it("syncs a literal head, adopts wanted server tags, and removes unwanted ones, with HtmlHead", async () => {
    document.head.innerHTML =
      `<title data-eui>Old</title><meta name="description" content="About" data-eui>` +
      `<meta name="robots" content="noindex" data-eui>`
    const kept = document.head.querySelector("meta[name=description]")
    const { apply, warnings } = await freshHost({ htmlHead: true })
    apply(literal([meta("description", "About"), meta("author", "Ada")]))
    expect(document.title).toBe("App")
    expect(document.head.querySelector("meta[name=description]")).toBe(kept)
    expect(
      document.head.querySelector("meta[name=author][data-eui]")?.getAttribute(
        "content"
      )
    ).toBe("Ada")
    expect(document.head.querySelector("meta[name=robots]")).toBeNull()
    expect(document.documentElement.getAttribute("lang")).toBe("en")
    expect(document.body.className).toBe("dark")
    expect(warnings).toEqual([])
  })
})
