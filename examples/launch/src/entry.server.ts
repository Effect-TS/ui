/// <reference types="@effect/ui/html/HtmlServerViteDocument" />
import { HtmlServer } from "@effect/ui/html"
import { Effect } from "effect"
import { HttpRouter, HttpServerResponse } from "effect/http"
import { document } from "virtual:@effect/ui/document"
import { snippets } from "virtual:snippets"
import { LaunchPage } from "./LaunchPage.ts"

// The page at `/`, rendered per request in dev and prerendered in a build.
export default HttpRouter.add(
  "GET",
  "/",
  (request) =>
    HtmlServer.renderToHtml(
      LaunchPage,
      {
        snippets,
        articleUrl: new URL("/article.md", request.originalUrl).href
      },
      { static: import.meta.env.PROD }
    ).pipe(
      Effect.map((page) => HttpServerResponse.html(document(page)))
    )
)

export const prerender = ["/"]
