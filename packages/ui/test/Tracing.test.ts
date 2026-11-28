import { Command, Component, Query, UiSchema } from "@effect/ui"
import { Story, TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer, Option, Schema, Tracer } from "effect"
import { HttpClient, HttpClientResponse, HttpTraceContext } from "effect/http"
import { TestClock } from "effect/testing"

// The server: each request opens a "db" span under the client span its `traceparent` names.
const server = HttpClient.make((request, url) =>
  Effect.as(
    Effect.withSpan(Effect.void, `db ${url.pathname}`, {
      parent: Option.getOrThrow(HttpTraceContext.fromHeaders(request.headers))
    }),
    HttpClientResponse.fromWeb(request, new Response("ok"))
  )
)

const call = Effect.fnUntraced(function*(path: string) {
  const client = yield* HttpClient.HttpClient
  return () => Effect.orDie(Effect.asVoid(client.get(`http://api${path}`)))
})

class GetCart extends Query.Service<GetCart>()("shop/GetCart", {
  args: {},
  success: Schema.Void,
  error: Schema.Never,
  staleTime: "1 hour"
}) {
  static readonly layer = this.toLayer(call("/cart"))
}

class GetStock extends Query.Service<GetStock>()("shop/GetStock", {
  args: {},
  success: Schema.Void,
  error: Schema.Never,
  staleTime: "1 hour"
}) {
  static readonly layer = this.toLayer(call("/stock"))
}

class Preflight extends Command.Service<Preflight>()("shop/Preflight", {
  args: {},
  success: Schema.Void
}) {
  static readonly layer = this.toLayer(call("/preflight"))
}

class Release extends Command.Service<Release>()("shop/Release", {
  args: {},
  success: Schema.Void,
  invalidates: () => [GetCart, GetStock]
}) {
  static readonly layer = this.toLayer(call("/release"))
}

const Message = UiSchema.TaggedEnum({
  Check: {},
  Checked: { span: Command.SpanContext },
  Confirm: {},
  Done: {}
})

// Preflight, then a confirmation dialog that holds the preflight's span until the user confirms.
const Checkout = Component.define({
  name: "Checkout",
  model: Schema.Struct({ confirming: Schema.NullOr(Command.SpanContext) }),
  message: Message,
  queries: {
    cart: { query: GetCart, args: () => ({}) },
    stock: { query: GetStock, args: () => ({}) }
  }
}).make({
  init: () => ({ confirming: null }),
  update: ($, message) =>
    Message.match(message, {
      Check: () =>
        $.run(
          Preflight.make().pipe(
            Command.map((_, span) => Message.Checked({ span }))
          )
        ),
      Checked: ({ span }) => ({ confirming: span }),
      Confirm: () =>
        $.set({ confirming: null }).run(
          Release.make().pipe(
            Command.withParentSpan($.model.confirming),
            Command.as(Message.Done())
          )
        ),
      Done: () => $.model
    }),
  view: (h) => h.el("p", "checkout")
})

describe("tracing", () => {
  it.effect("continues a preflight's trace through confirmation, refetches and the server", () => {
    const spans: Array<Tracer.Span> = []
    return Effect.gen(function*() {
      const tracer = yield* Effect.tracer
      yield* Effect.gen(function*() {
        const root = yield* TestHost.mount(Checkout, {})
        yield* TestHost.settle
        const watched = spans.length
        root.send(Message.Check())
        yield* TestHost.settle
        const preflight = spans[watched]
        assert.strictEqual(preflight.name, "shop/Preflight")
        // Nothing stays open while the dialog waits.
        assert.isTrue(spans.every((span) => span.status._tag === "Ended"))
        yield* TestClock.adjust("1 minute")
        root.send(Message.Confirm())
        yield* TestHost.settle
        // An unrelated preflight starts its own trace.
        const settled = spans.length
        root.send(Message.Check())
        yield* TestHost.settle

        const byId = new Map(spans.map((span) => [span.spanId, span]))
        const parentName = (span: Tracer.Span) =>
          Option.match(span.parent, {
            onNone: () => undefined,
            onSome: (parent) => byId.get(parent.spanId)?.name
          })
        const flow = spans.slice(watched, settled)
        assert.deepStrictEqual(
          flow.map((span) => [span.name, parentName(span)]),
          [
            ["shop/Preflight", undefined],
            ["GET", "shop/Preflight"],
            ["db /preflight", "GET"],
            ["shop/Release", "shop/Preflight"],
            ["GET", "shop/Release"],
            ["db /release", "GET"],
            ["shop/GetCart", "shop/Release"],
            ["GET", "shop/GetCart"],
            ["db /cart", "GET"],
            ["shop/GetStock", "shop/Release"],
            ["GET", "shop/GetStock"],
            ["db /stock", "GET"]
          ]
        )
        assert.isTrue(flow.every((span) => span.traceId === preflight.traceId))
        const unrelated = spans[settled]
        assert.notStrictEqual(unrelated.traceId, preflight.traceId)

        // The idle gap is between the runs, not inside either.
        const release = flow[3]
        const ended = (span: Tracer.Span) =>
          span.status._tag === "Ended" ? span.status.endTime : -1n
        const minute = 60_000_000_000n
        assert.isTrue(ended(preflight) - preflight.status.startTime < minute)
        assert.isTrue(ended(release) - release.status.startTime < minute)
        assert.isTrue(release.status.startTime - ended(preflight) >= minute)

        // The log tells DevTools the same tree.
        const logged = root.log().flatMap((entry) =>
          entry._tag === "CommandStarted"
            ? [[entry.name, entry.traceId, entry.parentSpanId]]
            : entry._tag === "FetchStarted" && entry.trigger === "invalidation"
            ? [[entry.query, entry.traceId, entry.parentSpanId]]
            : []
        )
        assert.deepStrictEqual(logged, [
          ["shop/Preflight", preflight.traceId, undefined],
          ["shop/Release", preflight.traceId, preflight.spanId],
          ["shop/GetCart", preflight.traceId, release.spanId],
          ["shop/GetStock", preflight.traceId, release.spanId],
          ["shop/Preflight", unrelated.traceId, undefined]
        ])
      }).pipe(Effect.provideService(
        Tracer.Tracer,
        Tracer.make({
          span: (options) => {
            const span = tracer.span(options)
            spans.push(span)
            return span
          }
        })
      ))
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          GetCart.layer,
          GetStock.layer,
          Preflight.layer,
          Release.layer
        ).pipe(
          Layer.provide(Layer.succeed(HttpClient.HttpClient, server))
        )
      ),
      Effect.scoped,
      Effect.provide(TestHost.layer())
    )
  })

  it("Story hands each run a span, and a continued run names its parent", () => {
    const checked = Story.start(Checkout, {})
      .loaded("cart", undefined)
      .loaded("stock", undefined)
      .send(Message.Check())
      .resolve(Preflight, undefined)
    const span = checked.current.model.confirming
    assert.deepStrictEqual(span, {
      traceId: "00000000000000000000000000000001",
      spanId: "0000000000000001",
      sampled: true
    })
    const confirmed = checked.send(Message.Confirm())
    assert.deepStrictEqual(
      confirmed.current.pending.map(({ command }) => command.parentSpan),
      [span ?? undefined]
    )
    confirmed.resolve(Release, undefined)
  })
})
