import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import type * as HtmlImages from "../HtmlImages.ts"

/** @internal */
export const Images: Context.Reference<HtmlImages.Images> = Context.Reference<
  HtmlImages.Images
>(
  "@effect/ui/html/HtmlImages/Images",
  { defaultValue: () => pending }
)

const pending: HtmlImages.Images = { load: () => Effect.never }

/** @internal */
export let loader:
  | ((
    document: Document,
    source: HtmlImages.ImageSource
  ) => Effect.Effect<"loaded" | "error">)
  | undefined

/** @internal */
export const load = (image: NonNullable<typeof loader>): void => {
  loader = image
}
