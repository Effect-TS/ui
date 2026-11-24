# @effect/ui

A frontend framework for Effect whose apps are composed with Layers. A component is Schemas for its props, Model, messages and events, and pure `init`, `update` and `view` functions. Side effects are Commands and Subscriptions that the runtime runs, and data comes from queries (`Query`).

| Import                           | Holds                                                                                                                                           |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `@effect/ui`                     | The host-agnostic core: `Command`, `Component`, `Feature`, `Head`, `Query`, `MessageLog`, `Renderer`, `Route`, `Router`, `Subscription`, `View` |
| `@effect/ui/testing`             | `Story`, `Scene`, `Steps`, `TestHost`, `Locator`, `TestQuery`                                                                                   |
| `@effect/ui/html`                | `Html` (`Html.component`, `Html.H`), `BrowserHost`, `BrowserRouter`, `HtmlServer`                                                               |
| `@effect/ui/html/HtmlServerHttp` | Serving a routed app's pages through `effect/http`                                                                                              |
| `@effect/ui/html/testing`        | `HtmlLocator`, `HtmlScene`, `Ssr`                                                                                                               |

Only `@effect/ui/html` needs the DOM lib types. The rest type checks without it.

```sh
pnpm add @effect/ui effect
```

The package is experimental: its API may change in any release. `LLMS.md` at the repository root has the guide and worked examples.
