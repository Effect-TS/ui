// @vitest-environment happy-dom
import { Component, Subscription } from "@effect/ui"
import { HtmlCommand } from "@effect/ui/html"
import { HtmlLocator, HtmlScene } from "@effect/ui/html/testing"
import { describe, it } from "@effect/vitest"
import { Effect } from "effect"
import {
  ApplyTheme,
  SiteHeader,
  SiteHeaderMessage
} from "./SiteHeader.ts"

const theme = Subscription.keyOf("theme")

const toDark = HtmlLocator.role("button", {
  name: "Switch to dark theme"
})
const toLight = HtmlLocator.role("button", {
  name: "Switch to light theme"
})
const openMenu = HtmlLocator.role("button", { name: "Open menu" })
const closeMenu = HtmlLocator.role("button", { name: "Close menu" })
const menuLink = HtmlLocator.role("link", { name: "effect.website" })

describe("SiteHeader", () => {
  it.effect("toggles and tracks the color theme", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(SiteHeader, {})
      scene
        .click(toDark)
        .expectExact(ApplyTheme.make({ theme: "dark" }))
        .resolve(ApplyTheme, Component.noop)
        .expect(toLight).toExist()
        .subscription(
          theme,
          SiteHeaderMessage.ChangedTheme({ theme: "light" })
        )
        .expect(toDark).toExist()
    }))

  it.effect("opens the narrow menu and closes it on Escape or a link", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(SiteHeader, {})
      scene
        .click(openMenu)
        .expect(closeMenu).toExist()
        .fireDocument("keydown", { key: "Escape" })
        .resolve(HtmlCommand.Focus, { found: true })
        .expect(openMenu).toExist()
        .expect(menuLink).toBeAbsent()
        .click(openMenu)
        .click(menuLink)
        .expect(openMenu).toExist()
    }))
})
