import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import type * as HtmlFiles from "../HtmlFiles.ts"

/** @internal */
export const Files: Context.Reference<HtmlFiles.Files> = Context.Reference<
  HtmlFiles.Files
>(
  "@effect/ui/html/HtmlFiles/Files",
  { defaultValue: () => pending }
)

const pending: HtmlFiles.Files = { pick: () => Effect.never }
