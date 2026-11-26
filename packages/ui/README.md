# @effect/ui

A frontend framework for Effect whose apps are composed with Layers. A component is Schemas for its props, Model, messages and events, and pure `init`, `update` and `view` functions. Side effects are Commands and Subscriptions that the runtime runs, and data comes from queries (`Query`).

| Import                            | Holds                                                                                                                                                                                                                                               |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@effect/ui`                      | The host-agnostic core: `Command`, `Component`, `Feature`, `Head`, `MessageLog`, `Mount`, `Query`, `Renderer`, `Route`, `Router`, `Subscription`, `UiSchema`, `UiStruct`, `Validation`, `View`                                                      |
| `@effect/ui/testing`              | `Locator`, `Play`, `Scene`, `Steps`, `Story`, `TestHost`, `TestQuery`                                                                                                                                                                               |
| `@effect/ui/html`                 | `BrowserHost`, `BrowserRouter`, `Canvas`, `Html` (`Html.component`, `Html.H`), `HtmlCommand`, `HtmlFiles`, `HtmlHead`, `HtmlHydrate`, `HtmlImages`, `HtmlKeyboard`, `HtmlScheduler`, `HtmlServer`, `HtmlSubscription`, `Markdown`, `MarkdownParser` |
| `@effect/ui/html/HtmlServerHttp`  | Serving a routed app's pages through `effect/http`                                                                                                                                                                                                  |
| `@effect/ui/html/MarkdownVite`    | Vite plugin that compiles `.md` files into document modules at build time                                                                                                                                                                           |
| `@effect/ui/html/MarkdownContent` | TypeScript module types for `*.md` imports compiled by `MarkdownVite`                                                                                                                                                                               |
| `@effect/ui/html/testing`         | `HtmlLocator`, `HtmlPlay`, `HtmlScene`, `Ssr` (`ssr`), `TestAnimationFrames`, `TestFiles`, `TestGlobalEvents`, `TestImages`                                                                                                                         |

Only the `@effect/ui/html*` entry points need the DOM lib types. The rest type checks without it.

```sh
pnpm add @effect/ui effect
```

The package is experimental: its API may change in any release. `LLMS.md` at the repository root has the guide and worked examples.
