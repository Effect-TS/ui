/// <reference types="@effect/ui/html/HtmlServerViteDocument" />
import { normalizeLabel } from "#domain/Domain"
import type { HtmlServer } from "@effect/ui/html"
import { layerHttp } from "@effect/ui/html/HtmlServerHttp"
import { Layer } from "effect"
import { document } from "virtual:@effect/ui/document"
import { App } from "./App.ts"
import { bootstrapConfig, bootstrapSearch } from "./bootstrap.ts"
import { AppRoute, homeUrl } from "./routes.ts"
import { DomainsApiLive } from "./server/DomainsApiLive.ts"
import { Domains } from "./services/Domains.ts"

// Runs before the client entry loads, so typing during startup shows at once.
const bootstrap = `<script>(${bootstrapSearch})(${
  JSON.stringify(bootstrapConfig)
}, ${normalizeLabel})</script>`

const page = (rendered: HtmlServer.Rendered<unknown>): string => {
  const html = document(rendered)
  const end = html.lastIndexOf("</body>")
  return html.slice(0, end) + bootstrap + html.slice(end)
}

// The pages and `/api/domains`, served per request in dev. A build
// prerenders the landing page and the 404 page.
export default Layer.mergeAll(
  DomainsApiLive,
  layerHttp(App, {
    routes: AppRoute,
    budget: "300 millis",
    document: page,
    static: import.meta.env.PROD
  })
).pipe(Layer.provide(Domains.layerSample))

export const prerender = [homeUrl, "/404"]
