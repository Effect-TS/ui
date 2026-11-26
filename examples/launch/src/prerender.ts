import { HtmlServer } from "@effect/ui/html"
import { Effect } from "effect"
import { snippets } from "virtual:snippets"
import { LaunchPage } from "./LaunchPage.ts"

const articleUrl = "https://ui.effect.website/article.md"

/** Renders the launch page to HTML and serialized hydration state for `dist/index.html`. */
export const render = () =>
  Effect.runPromise(
    HtmlServer.renderToHtml(
      LaunchPage,
      { snippets, articleUrl },
      { static: true }
    )
  ).then(({ html, state }) => ({
    html,
    state: HtmlServer.serializeState(state)
  }))
