// @vitest-environment happy-dom
import { Component, UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { ssr } from "@effect/ui/html/testing"
import { TestHost } from "@effect/ui/testing"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"

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
  scoped: false,
  model: Schema.String,
  message: Schema.Never,
  elements: Html
})
  .make({
    init: () => "draft from the " + side(inits.profile++),
    update: (model) => model,
    view: (draft, h) => h.form(h.p(draft), Avatar(h, { key: "a" }))
  })

const Settings = Component.define({
  name: "Settings",
  scoped: false,
  model: Schema.String,
  message: UiSchema.TaggedEnum({ Show: { tab: Schema.String } }),
  elements: Html
}).make({
  init: () => "billing",
  update: (_, { tab }) => tab,
  view: (tab, h) => h.main(h.h1(tab), Profile(h, { key: "p", detached: tab !== "profile" }))
})

describe("detached children on the server", () => {
  it.effect("writes no nodes for a detached child, and the client builds them from the server's state", () =>
    Effect.gen(function*() {
      inits = { avatar: 0, profile: 0 }
      // Fails if the client rebuilt nodes the server wrote, or didn't adopt a Model the server sent.
      const result = yield* ssr(Settings, {})
      assert.include(result.html, "<!--[/Settings/Profile[p]--><!--]/Settings/Profile[p]-->")
      assert.notInclude(result.html, "draft from")
      assert.include(result.adopted, "/Settings/Profile[p]")
      assert.include(result.adopted, "/Settings/Profile[p]/Avatar[a]")

      result.root.send({ _tag: "Show", tab: "profile" })
      yield* TestHost.settle
      assert.strictEqual(result.container.querySelector("p")!.textContent, "draft from the server")
      assert.strictEqual(result.container.querySelector("i")!.textContent, "avatar from the server")
    }).pipe(Effect.provide(TestHost.layer())))
})
