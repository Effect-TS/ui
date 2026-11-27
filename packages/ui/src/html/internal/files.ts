import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import type * as Html from "../Html.ts"
import type * as HtmlFiles from "../HtmlFiles.ts"

/** @internal */
export const Files: Context.Reference<HtmlFiles.Files> = Context.Reference<
  HtmlFiles.Files
>(
  "@effect/ui/html/HtmlFiles/Files",
  { defaultValue: () => fallback }
)

const fallback: HtmlFiles.Files = {
  pick: () => Effect.never,
  download: () => Effect.void
}

/** @internal */
export interface Browser {
  readonly pick: (
    document: Document,
    htmlHost: Context.Service.Shape<typeof Html.Host>,
    options: HtmlFiles.PickOptions
  ) => Effect.Effect<HtmlFiles.Picked>
  readonly download: (document: Document, file: File) => Effect.Effect<void>
}

/** @internal */
export let browser: Browser | undefined

/** @internal */
export const load = (files: Browser): void => {
  browser = files
}
