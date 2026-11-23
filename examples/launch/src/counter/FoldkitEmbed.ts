import { Mount } from "@effect/ui"
import { Effect, Stream } from "effect"
import { Runtime } from "foldkit"
import * as Page from "./foldkit/Page.ts"

export const EmbedFoldkitPage = Mount.makeStream(
  "EmbedFoldkitPage",
  { args: {} },
  (node: HTMLElement) =>
    Stream.callback<never>(() =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const container = document.createElement("div")
          container.id = "foldkit-counter"
          node.append(container)
          return Runtime.embed(Runtime.makeElement({ ...Page, container }))
        }),
        (handle) => Effect.promise(() => handle.disposeAsync())
      )
    )
)
