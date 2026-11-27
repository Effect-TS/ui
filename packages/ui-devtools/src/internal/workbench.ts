import * as BrowserCase from "@effect/ui/html/testing/BrowserCase"
import * as Case from "@effect/ui/testing/Case"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"

const segment = "/__workbench/"

const collect = (
  exports: unknown,
  cases: Map<string, Case.Case<any, never>>
): void => {
  if (typeof exports !== "object" || exports === null) return
  for (const value of Object.values(exports)) {
    if (Case.isCase(value)) cases.set(value.name, value as never)
    else if (typeof value === "object" && value !== null) {
      for (const inner of Object.values(value)) {
        if (Case.isCase(inner)) cases.set(inner.name, inner as never)
      }
    }
  }
}

const element = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string
): HTMLElementTagNameMap[K] => {
  const made = document.createElement(tag)
  if (text !== undefined) made.textContent = text
  return made
}

/**
 * Loads every case module, then mounts the case the URL names into `#root`,
 * or lists every case when the URL names none or an unknown one.
 */
export const run = async (
  modules: Readonly<Record<string, () => Promise<unknown>>>
): Promise<void> => {
  const container = document.getElementById("root")!
  const cases = new Map<string, Case.Case<any, never>>()
  const failed: Array<string> = []
  const loaded = await Promise.allSettled(
    Object.values(modules).map((load) => load())
  )
  Object.keys(modules).forEach((path, i) => {
    const result = loaded[i]!
    if (result.status === "fulfilled") collect(result.value, cases)
    else failed.push(path + ": " + String(result.reason))
  })
  const path = location.pathname
  const at = path.indexOf(segment)
  const base = at < 0 ? segment : path.slice(0, at + segment.length)
  const name = at < 0
    ? ""
    : decodeURIComponent(path.slice(at + segment.length)).replace(/\/$/, "")
  const found = cases.get(name)
  if (found !== undefined) {
    Effect.runFork(
      Effect.scoped(Effect.andThen(
        BrowserCase.mount(found, container),
        Effect.andThen(
          // After the commit that follows the last message.
          Effect.sync(() =>
            requestAnimationFrame(() =>
              container.setAttribute("data-workbench-ready", "")
            )
          ),
          Effect.never
        )
      )).pipe(
        Effect.catchCause((cause) =>
          Effect.sync(() =>
            container.replaceChildren(element("pre", Cause.pretty(cause)))
          )
        )
      )
    )
    return
  }
  const list = element("ul")
  for (const each of [...cases.keys()].sort()) {
    const link = element("a", each)
    link.href = base + encodeURI(each) + location.search
    const item = element("li")
    item.append(link)
    list.append(item)
  }
  const page = element("main")
  page.style.fontFamily = "system-ui, sans-serif"
  page.append(element("h1", "Workbench"))
  if (name !== "") page.append(element("p", `Case "${name}" not found.`))
  page.append(list)
  for (const failure of failed) page.append(element("pre", failure))
  container.replaceChildren(page)
}
