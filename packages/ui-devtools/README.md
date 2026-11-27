# @effect/ui-devtools

An inspector for the message log of an [`@effect/ui`](../ui) app: an overlay in the page, and an MCP server agents use to read and control the app.

## The overlay

`DevTools.layer` provides the app's `MessageLog` and mounts an inspector overlay in a corner of the page, for as long as the Layer is built:

```ts
import { DevTools } from "@effect/ui-devtools"
import { BrowserHost } from "@effect/ui/html"
import { Effect, Layer } from "effect"
import { App } from "./App.ts"

const Main = BrowserHost.mount(App, {}, document.getElementById("app")!).pipe(
  Layer.provide(
    import.meta.env.DEV
      ? DevTools.layer({ position: "BottomRight" })
      : Layer.empty
  )
)

Effect.runFork(Layer.launch(Main))
```

The overlay starts as a button, with a count of the failures logged since the panel was last closed. Opened, it shows:

- the timeline, newest first, filtered by kind or by instance and everything under it, with a rail marking the selected entry's chain
- the instance tree, opened down to the selected entry's instance, with a count of what failed or is running under each branch. **Show active instances** lists only the instances with something to report, failed and interrupted first, each with how its Command runs ended, and **Browse all** goes back to the tree. A find field searches every instance by name or component
- the path of the selected entry's instance, each segment a button that scopes the timeline to it
- the causal chain of the selected entry, from what sent the message to where each Command it issued stopped and what stopped it, every `#n` a link to that entry
- the entry's Model with what changed since that instance's previous entry, marked with `~`, a struck-out old value and a CHANGED badge, so it reads without colour; its message, Commands, events and raw frame
- the lifecycle of the instance: its Layer build, Subscriptions, mounts and Command runs, open or with how they ended

### Pick

Click **Pick** on the launcher or in the panel header, then click a page element to inspect its owning instance. While picking, an outline shows the element under the pointer and its owner's path. Selecting it opens the panel scoped to that instance and expands its tree branch. The click and the press before it do not reach the app. Escape cancels. Pick is disabled while the page is paused.

Slot content belongs to the instance that passed it. An element with a headless component's part belongs to that component, or the outermost owner when parts are composed. Hovering an instance row outlines that instance's elements.

Use `BrowserHost.instanceAt` to look up one node, or `BrowserHost.instancesAt` for many nodes at once. The lookup walks render records when called and adds no attributes to application markup. A nested root owns the elements it renders.

### Time travel

**Time travel**, at the top of a selected entry, opens the time travel slider at that entry and paints the page as it was there. The root's container is hidden and an `inert` copy is painted beside it from each instance's Model, query results and props at that point, while the live app keeps running unseen. The header reads _Paused at #n_ with a **Resume** button, and a slider moves the painted page through the timeline's rows, as filtered, that it can show. Selecting another entry while paused paints that one. When it belongs to another root, that root is paused and the first one comes back. Resume, or Follow latest, removes the copy and shows the live page again, as does unmounting the paused root.

The copy runs no Command, Subscription, query or Layer build, and takes no events. A provided Layer isn't built in the copy, so a feature slot whose service comes from one shows its fallback, and the bar lists the path of each instance that shows one. An instance with no recorded state at that entry starts from `init`, and the bar lists it too. With the panel closed, the launcher shows the Paused badge and Resume. A modal dialog or an auto popover in the copy shows as a manual popover, so the copy never blocks the panel or closes the live page's popovers, and the panel stays above it.

The overlay keeps the raw entries, alongside the Wire frames, to paint from. The entries before the oldest one it holds are folded into the state it starts from, so it can show any entry it still lists. Only roots mounted with `BrowserHost.mount`, `mountEffect` or `HtmlHydrate.hydrate` under the Layer can be shown. To combine the overlay with another log, use `MessageLog.fanout`, which keeps the roots reaching the overlay.

### Other details

It follows the latest entry until one is selected, and remembers whether the panel is open and its size in `localStorage`. **Clear** empties the timeline while keeping mounted instances, the next entry's diff, and Time travel accurate (disabled while the page is paused).

`DevTools.layer` accepts `position`, `size` (1,000 shown entries by default) and `exclude` (message `_tag` values matched across every component). Excluded updates add no rows and coalesce per instance between shown entries so high-frequency bursts do not evict the buffer, while keeping the next shown entry's Model diff and Time travel state accurate. `exclude` is not a way to hide sensitive data: later entries still carry whatever an excluded message changed in the Model — use `Schema.Redacted` for sensitive values.

Use `DevTools.layer({ fields: ["commandId"] })` to show top-level message and Command argument values on timeline rows. Only string, number and boolean values are shown; redacted values are omitted. Click a value to filter by its field name and value across instances. Click it again, or click the chip under the filters, to clear the field filter. Other filters still apply.

`exclude` sets the initial recording policy. To change it while the app runs, select an update and click **Stop recording** to exclude future updates with its message `_tag`. The **Not recording** strip under the filters lists stopped tags, including configured exclusions. Click a tag to resume recording it.

These choices override `exclude` for the selected tags and persist through reloads until the tab closes. They affect future updates, not existing entries, and cannot recover evicted history. Excluded Wire frames carry the same policy to the Node server and its agent tools.

It is mounted in an iframe with `MessageLog.noop`, so the page's styles don't reach it, a key pressed or a click in it never reaches the app's document and window listeners, and it never logs its own updates. Its theme follows `prefers-color-scheme`.

## The MCP server

`@effect/ui-devtools/node` runs a local server that agents connect to over MCP (Streamable HTTP). With Vite, add the plugin and keep `DevTools.layer()` in the app:

```ts
import { DevToolsVite } from "@effect/ui-devtools/node"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [DevToolsVite.plugin({ dispatch: true })]
})
```

Then point the agent at `http://127.0.0.1:4774/mcp`, for example in `.mcp.json`:

```json
{
  "mcpServers": {
    "effect-ui": { "type": "http", "url": "http://127.0.0.1:4774/mcp" }
  }
}
```

The plugin starts the server with `vite dev` only and adds a `<meta>` tag with its URL, `size` and `fields` to the page, which `DevTools.layer` reads. Without Vite, run `effect-ui-devtools [--port <n>] [--size <n>] [--dispatch] [--field <name>]...` or `DevToolsServer.layer`, and pass `DevTools.layer({ server: "http://127.0.0.1:4774" })`. A server process can add `MessageLog.socket("ws://127.0.0.1:4774/log", { host: "server" })` to show its renders as sessions.

| Tool                 | Does                                                                                          |
| -------------------- | --------------------------------------------------------------------------------------------- |
| `list_sessions`      | the sessions held: app, host, connected, controllable, paused at, the tags not recorded       |
| `list_instances`     | the instances of a session, with how their Command runs ended                                 |
| `list_entries`       | entries as rows with their `fields`, filtered by instance, kind, `_tag` or field value        |
| `count_entries`      | entries by entry and message `_tag`                                                           |
| `get_entry`          | one entry's Wire frame                                                                        |
| `get_chain`          | the causal chain the panel shows                                                              |
| `get_state`          | an instance's Model, props and query results, now or at an entry                              |
| `diff_state`         | what an entry changed in its instance's Model                                                 |
| `show_entry`         | paints the page at an entry, as Time travel does                                              |
| `resume`             | shows the live page again                                                                     |
| `set_recording`      | stops or starts recording a message `_tag`, as the panel's Stop recording does                |
| `get_message_schema` | dispatch JSON Schema and per-tag examples, templates, or reasons no safe example is available |
| `find_instances`     | the instances that rendered the elements matching a CSS selector, 20 at most                  |
| `get_picked`         | the element last picked with Pick in a session, and the instance that rendered it             |
| `dispatch`           | sends 1 to 100 messages to an instance, all decoded first; off by default                     |
| `wait`               | waits for the Command runs started since an entry to end                                      |

Most read tools answer from the server's copy of the log and remain available after a reload or a closed tab. The server also retains the last pick for `get_picked`. `find_instances` and the control tools require an open page.

`find_instances` and `get_picked` give each element's tag, the instance number, path and component that rendered it, and for `find_instances` its index in `document.querySelectorAll(selector)`, but never the element's text. Their element metadata comes from the DOM, not Wire frames, so `Schema.Redacted` does not protect it. A `find_instances` selector can test rendered attribute values, as any script or browser tool on the page can.

An agent's `show_entry` is the same pause as Time travel, so the panel shows it and either side can resume it. `dispatch` runs `update` and its real Commands, which is why it needs `dispatch: true` (or `--dispatch`). A redacted field needs a real value, and comes back redacted.

The server listens on loopback only. `/mcp` refuses requests with an `Origin` header, and the WebSocket routes accept only loopback origins. There is no token, so any local user can connect, as they can to the Vite dev server.

### WebMCP (experimental)

When the browser exposes the [WebMCP](https://webmachinelearning.github.io/webmcp/) API (`document.modelContext`), `DevTools.layer()` also registers the same tools directly in the page, with no Node server, port or Vite plugin:

```ts
DevTools.layer()
DevTools.layer({ webMcp: { dispatch: true } })
DevTools.layer({ webMcp: false })
```

By default, `DevTools.layer()` registers the 15 read and control tools whenever `document.modelContext` exists. Pass `webMcp: { dispatch: true }` to also register `effect_ui_dispatch`, or `webMcp: false` to disable WebMCP registration.

Tool names are prefixed with `effect_ui_` (`effect_ui_list_sessions`, `effect_ui_get_state`, etc.) and annotated with `debugging: true`, so agents driving Chrome with `chrome-devtools-mcp` (`--categoryExperimentalThirdParty`) discover them automatically. Tools are unregistered when the Layer closes. State inspection reads Wire frames, where `Schema.Redacted` values stay placeholders. `effect_ui_find_instances` and `effect_ui_get_picked` return DOM-derived metadata with the same privacy limits as their Node server equivalents.

Unlike the Node server, the in-page tools only see the current page load and answer from the overlay's inspector (so Clear empties the timeline). Both can run at the same time and share the same pause.

## Terminal apps

An app with no DOM, such as an OpenTUI app, sends its log to the server with `DevToolsHeadless.layer`. It isn't in the package's index, so the app never loads the overlay:

```ts
import * as DevToolsHeadless from "@effect/ui-devtools/DevToolsHeadless"

OpenTuiHost.run(App, {}).pipe(Effect.provide(DevToolsHeadless.layer()))
```

Run `effect-ui-devtools` in another terminal and open the URL it prints, `http://127.0.0.1:4774` by default. The page is the overlay's panel, filling the tab: it shows the newest session the server holds and follows it live. It's read-only, with no Time travel, and the server can't pause a terminal session or dispatch to it. The page works for web sessions too, and `DevToolsVite.plugin` prints the same URL.

## The core

`Inspector` is the overlay's core, with no UI. It reads the log's Wire entries and answers the questions a devtools view asks: which entry a number stands for, what an entry was caused by and what it caused, which Command run an `update` issued and how that run ended, and what an instance has going.

```ts
import { MessageLog } from "@effect/ui"
import { Inspector } from "@effect/ui-devtools"
import { Effect, Layer } from "effect"

const inspector = Inspector.make()

// Provide this to `BrowserHost.mount` to feed the inspector from a running app.
const InspectorLog = Layer.effect(
  MessageLog.MessageLog,
  MessageLog.makeEncoded((batch) => Effect.sync(() => inspector.ingest(batch)))
)

// Later: follow each Command run of the first session to where it ended.
for (const session of inspector.sessions()) {
  for (const record of session.records()) {
    if (record.kind !== "command" || record.end === undefined) continue
    console.log(record.name, record.reason, session.resolve(record.end))
  }
}
```

The inspector reads Wire frames only, and the overlay shows only what it reads, so a `Schema.Redacted` value reaches them, and a copied frame, as the encoder's placeholder. The raw entries the overlay keeps to paint the page stay in memory and are only handed to the app's own views. A Subscription's key and deps and the message text of an error have no Schema to mark them, and are sent in clear: see `MessageLog.Wire`.

The package is experimental and not yet on npm: install it alongside `@effect/ui` and `@effect/ui-kit` from [snapshots](../../README.md#snapshots) (`@effect/ui-devtools/node` also requires `@effect/platform-node`).
