/**
 * A server entry for the lifecycle test. Its evaluation, its responses and
 * its Layer's finalizer wait on gates the test controls.
 */
import { Effect, Layer } from "effect"
import { HttpRouter, HttpServerResponse } from "effect/http"

export interface Gates {
  /** Resolves with the version once the test lets evaluation go on. */
  readonly evaluate: () => Promise<number>
  /** Runs before each response. */
  readonly respond: (version: number) => Promise<void>
  /** Runs in the Layer's finalizer. */
  readonly finalize: (version: number) => Promise<void>
}

const gates =
  (globalThis as any)[Symbol.for("test/HtmlServerVite/gates")] as Gates
const version = await gates.evaluate()

export default HttpRouter.add(
  "GET",
  "/",
  Effect.promise(() => gates.respond(version)).pipe(
    Effect.as(HttpServerResponse.text(`v${version}`))
  )
).pipe(
  Layer.provide(
    Layer.effectDiscard(
      Effect.addFinalizer(() => Effect.promise(() => gates.finalize(version)))
    )
  )
)

export const prerender = []
