// @vitest-environment happy-dom
import { Component, Query } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { ssr } from "@effect/ui/html/testing"
import { TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { AsyncResult } from "effect/reactivity"

// The first init of each runs on the server: a Model the client built with its own init would say so.
let inits = { avatar: 0, profile: 0 }
const side = (count: number) => count === 0 ? "server" : "client"

const Avatar = Component.define({
  name: "Avatar",
  scoped: false,
  model: Schema.String,
  message: Schema.Never,
  elements: Html
}).make({
  init: () => "avatar from the " + side(inits.avatar++),
  update: (model) => model,
  view: (text, h) => h.i(text)
})

const Profile = Component.define({
  name: "Profile",
  scoped: true,
  model: Schema.String,
  message: Schema.Never,
  elements: Html
})
  .make({
    init: () => "draft from the " + side(inits.profile++),
    update: (model) => model,
    view: (draft, h) => h.form(h.p(draft), Avatar(h, { key: "a" }))
  })

class GetTab extends Query.Service<GetTab>()("GetTab", {
  args: {},
  success: Schema.String,
  error: Schema.Never,
  staleTime: "30 seconds"
}, Effect.succeed(() => Effect.succeed("billing"))) {}

const Settings = Component.define({
  name: "Settings",
  scoped: false,
  model: Schema.Boolean,
  message: Schema.Boolean,
  elements: Html,
  queries: { tab: { query: GetTab, args: () => ({}) } }
}).make({
  init: () => false,
  update: (_, shown) => shown,
  // Written while the tab loads, then kept once it says billing: the server holds a kept child.
  view: (shown, h) => {
    const billing = AsyncResult.isSuccess(h.queries.tab) && h.queries.tab.value === "billing"
    return h.main(
      h.h1(billing ? "billing" : "profile"),
      shown || !billing ? h.scoped((s) => Profile(s, { key: "p" })) : null
    )
  }
}).pipe(Component.provide(GetTab.layer))

describe("scoped children on the server", () => {
  it.effect("writes no nodes for a kept child, and the client takes its state once it's written", () =>
    Effect.gen(function*() {
      inits = { avatar: 0, profile: 0 }
      const result = yield* ssr(Settings, {})
      assert.notInclude(result.html, "draft from")
      assert.deepStrictEqual(result.adopted, ["/Settings"])

      result.root.send(true)
      yield* TestHost.settle
      assert.strictEqual(result.container.querySelector("p")!.textContent, "draft from the server")
      assert.strictEqual(result.container.querySelector("i")!.textContent, "avatar from the server")
    }).pipe(Effect.provide(TestHost.layer())))
})
