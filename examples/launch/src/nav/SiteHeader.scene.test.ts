// @vitest-environment happy-dom
import { Component, Subscription } from "@effect/ui"
import { HtmlCommand } from "@effect/ui/html"
import { HtmlLocator, HtmlScene } from "@effect/ui/html/testing"
import { Locator } from "@effect/ui/testing"
import { describe, it } from "@effect/vitest"
import { Effect } from "effect"
import {
  ApplyTheme,
  SiteHeader,
  SiteHeaderMessage
} from "./SiteHeader.ts"

const theme = Subscription.keyOf("theme")

const openMenu = HtmlLocator.role("button", { name: "Open menu" })
const closeMenu = HtmlLocator.role("button", { name: "Close menu" })

describe("SiteHeader", () => {
  it.effect("renders the wordmark, links, socials and theme toggle", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(SiteHeader, {})
      scene
        .expect(HtmlLocator.role("navigation", { name: "Main" }))
        .toExist()
        .expect(HtmlLocator.role("link", { name: "Effect home" }))
        .toExist()
        .expect(HtmlLocator.role("link", { name: "Effect UI" }))
        .toExist()
        .expect(Locator.attr("aria-current", "page"))
        .toHaveText("Introduction")
        .expect(HtmlLocator.role("link", { name: "Examples" }))
        .toExist()
        .expect(HtmlLocator.role("link", { name: "Effect docs" }))
        .toExist()
        .expect(
          HtmlLocator.role("link", { name: "Effect UI on GitHub" })
        ).toExist()
        .expect(HtmlLocator.role("link", { name: "Effect Discord" }))
        .toExist()
        .expect(
          HtmlLocator.role("button", { name: "Switch to dark theme" })
        ).toExist()
    }))

  it.effect("toggles and tracks the color theme", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(SiteHeader, {})
      scene
        .click(
          HtmlLocator.role("button", { name: "Switch to dark theme" })
        )
        .expectExact(ApplyTheme.make({ theme: "dark" }))
        .resolve(ApplyTheme, Component.noop)
        .expect(
          HtmlLocator.role("button", {
            name: "Switch to light theme"
          })
        ).toExist()
        .subscription(
          theme,
          SiteHeaderMessage.ChangedTheme({ theme: "light" })
        )
        .expect(
          HtmlLocator.role("button", { name: "Switch to dark theme" })
        ).toExist()
    }))

  it.effect("opens the narrow menu and closes it on Escape or a link", () =>
    Effect.gen(function*() {
      const scene = yield* HtmlScene.make(SiteHeader, {})
      scene
        .click(openMenu)
        .expect(closeMenu).toExist()
        .expect(HtmlLocator.role("link", { name: "effect.website" }))
        .toExist()
        .fireDocument("keydown", { key: "Escape" })
        .resolve(HtmlCommand.Focus, { found: true })
        .expect(openMenu).toExist()
        .expect(HtmlLocator.role("link", { name: "effect.website" }))
        .toBeAbsent()
        .click(openMenu)
        .click(HtmlLocator.role("link", { name: "effect.website" }))
        .expect(openMenu).toExist()
    }))
})
