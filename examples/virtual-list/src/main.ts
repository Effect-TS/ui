import { BrowserHost } from "@effect/ui/html"
// oxlint-disable-next-line no-unassigned-import
import "@effect/ui/html/register"
import { Effect, Layer } from "effect"
import { AbsoluteDemo } from "./AbsoluteDemo.ts"
import { BigDemo } from "./BigDemo.ts"
import { ChatDemo } from "./ChatDemo.ts"
import { FixedDemo } from "./FixedDemo.ts"
import { GridDemo } from "./GridDemo.ts"
import { HeaderDemo } from "./HeaderDemo.ts"
import { PagedDemo } from "./PagedDemo.ts"
import { ProgressDemo } from "./ProgressDemo.ts"
import { demoName } from "./shared.ts"
import { ShellDemo } from "./ShellDemo.ts"
import { TableDemo } from "./TableDemo.ts"

const root = document.getElementById("root")!

const demos: Record<string, readonly [title: string, mount: () => Layer.Layer<never>]> = {
  header: ["Content above the list changes size", () => BrowserHost.mount(HeaderDemo, {}, root)],
  shell: ["A scroller the list doesn't render", () => BrowserHost.mount(ShellDemo, {}, root)],
  paged: ["Position in a paged set", () => BrowserHost.mount(PagedDemo, {}, root)],
  fixed: ["Fixed sizes that hold", () => BrowserHost.mount(FixedDemo, {}, root)],
  chat: ["Loading older messages", () => BrowserHost.mount(ChatDemo, {}, root)],
  progress: ["Scroll offset and scroll end", () => BrowserHost.mount(ProgressDemo, {}, root)],
  table: ["A native table", () => BrowserHost.mount(TableDemo, {}, root)],
  absolute: ["Absolutely positioned rows", () => BrowserHost.mount(AbsoluteDemo, {}, root)],
  grid: ["A responsive grid", () => BrowserHost.mount(GridDemo, {}, root)],
  big: ["100,000 rows", () => BrowserHost.mount(BigDemo, {}, root)]
}

const demo = demos[demoName()]

if (demo === undefined) {
  root.innerHTML = "<main class=\"index\"><h1>VirtualList</h1><ul>" +
    Object.entries(demos).map(([name, [title]]) => `<li><a href="?demo=${name}">${title}</a></li>`).join("") +
    "</ul></main>"
} else {
  document.title = demo[0] + " · VirtualList"
  document.body.dataset["demo"] = demoName()
  Layer.launch(demo[1]()).pipe(Effect.runFork)
}
