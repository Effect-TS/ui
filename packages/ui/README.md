# @effect/ui

A frontend library for Effect. Each component is an Elm Architecture program of its own, and you build an app by composing components. A component owns its Model (defined with `Schema` along with props, messages, and events), handles its messages with a pure `update`, and renders its Model with `view`. Side effects are Commands and Subscriptions that the runtime runs, data comes from queries (`Query`), and services are provided with `Layer`s.

| Import                                   | Holds                                                                                                                                                                                                                                               |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@effect/ui`                             | The host-agnostic core: `Command`, `Component`, `Feature`, `Head`, `MessageLog`, `Mount`, `Query`, `Renderer`, `Route`, `Router`, `Subscription`, `UiSchema`, `UiStruct`, `Validation`, `View`                                                      |
| `@effect/ui/testing`                     | `Locator`, `Play`, `Scene`, `Steps`, `Story`, `TestHost`, `TestQuery`                                                                                                                                                                               |
| `@effect/ui/html`                        | `BrowserHost`, `BrowserRouter`, `Canvas`, `Html` (`Html.component`, `Html.H`), `HtmlCommand`, `HtmlFiles`, `HtmlHead`, `HtmlHydrate`, `HtmlImages`, `HtmlKeyboard`, `HtmlScheduler`, `HtmlServer`, `HtmlSubscription`, `Markdown`, `MarkdownParser` |
| `@effect/ui/html/HtmlServerHttp`         | Serving a routed app's pages through `effect/http`                                                                                                                                                                                                  |
| `@effect/ui/html/HtmlServerVite`         | Vite plugin that renders pages through a server entry in `vite dev`, prerenders them in `vite build`, and optionally emits a production web handler                                                                                                 |
| `@effect/ui/html/HtmlServerViteDocument` | TypeScript module types for `virtual:@effect/ui/document`, provided by `HtmlServerVite`                                                                                                                                                             |
| `@effect/ui/html/MarkdownVite`           | Vite plugin that compiles `.md` files into document modules at build time                                                                                                                                                                           |
| `@effect/ui/html/MarkdownContent`        | TypeScript module types for `*.md` imports compiled by `MarkdownVite`                                                                                                                                                                               |
| `@effect/ui/html/testing`                | `HtmlLocator`, `HtmlPlay`, `HtmlScene`, `Ssr` (`ssr`), `TestAnimationFrames`, `TestFiles`, `TestGlobalEvents`, `TestImages`, `TestMediaQueries`                                                                                                     |

The HTML entries listed above need DOM lib types; `@effect/ui` and `@effect/ui/testing` do not.

Every entry needs `strict` and `exactOptionalPropertyTypes` in your `tsconfig.json`: see [Requirements](../../README.md#requirements).

The package is experimental and not yet on npm: see the [snapshot install instructions](../../README.md#snapshots) at the repository root. `LLMS.md` at the repository root has the guide and worked examples.
