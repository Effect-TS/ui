import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import type * as Html from "../Html.ts"
import type * as HtmlFiles from "../HtmlFiles.ts"

/** @internal */
export const Files: Context.Reference<HtmlFiles.Files> = Context.Reference<
  HtmlFiles.Files
>(
  "@effect/ui/html/HtmlFiles/Files",
  { defaultValue: () => pending }
)

const pending: HtmlFiles.Files = { pick: () => Effect.never }

/** @internal */
export let picker:
  | ((
    document: Document,
    htmlHost: Context.Service.Shape<typeof Html.Host>,
    options: HtmlFiles.PickOptions
  ) => Effect.Effect<HtmlFiles.Picked>)
  | undefined

/** @internal */
export const load = (pick: NonNullable<typeof picker>): void => {
  picker = pick
}
