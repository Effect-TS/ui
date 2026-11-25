import { Icon } from "#components/Icon"
import {
  Command,
  Component,
  Subscription,
  UiSchema
} from "@effect/ui"
import { Button, NavigationMenu } from "@effect/ui-kit"
import { Html, HtmlCommand, HtmlSubscription } from "@effect/ui/html"
import { Effect, Schema, Stream } from "effect"
import { DiscordIcon, EffectWordmark, GitHubIcon } from "./Logos.ts"

const themeKey = "effect-ui-theme"

export const Theme = Schema.Literals(["light", "dark"])
export type Theme = typeof Theme.Type

export const SiteHeaderMessage = UiSchema.TaggedEnum({
  ClickedMenuToggle: {},
  ClickedMenuLink: {},
  ClickedOutside: {},
  PressedEscape: {},
  ClickedThemeToggle: {},
  ChangedTheme: { theme: Theme }
})

const MenuToggle = Html.ref("SiteHeader.menuToggle", "button")

const links = [
  { href: "/", label: "Introduction", active: true },
  {
    href: "https://github.com/Effect-TS/ui/tree/main/examples",
    label: "Examples",
    active: false
  },
  {
    href: "https://effect.website/docs/v4",
    label: "Effect docs",
    active: false
  }
] as const

const socials = [
  {
    href: "https://github.com/Effect-TS/ui",
    label: "Effect UI on GitHub",
    icon: GitHubIcon
  },
  {
    href: "https://discord.gg/effect-ts",
    label: "Effect Discord",
    icon: DiscordIcon
  }
] as const

export const ApplyTheme = Command.make(
  "ApplyTheme",
  { args: { theme: Theme } },
  ({ theme }) =>
    Effect.sync(() => {
      document.documentElement.dataset.theme = theme
      try {
        localStorage.setItem(themeKey, theme)
      } catch {
        // Ignore storage failures when persistence is unavailable.
      }
    }).pipe(Effect.as(Component.noop))
)

// The chosen theme is on `data-theme`, which index.html restores from
// storage before paint. Without one, the theme follows the system.
const TrackTheme = Subscription.make(
  "theme",
  Stream.suspend(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    return Stream.fromEventListener(media, "change").pipe(
      Stream.prepend([undefined]),
      Stream.map((): Theme => {
        const chosen = document.documentElement.dataset.theme
        if (chosen === "light" || chosen === "dark") return chosen
        return media.matches ? "dark" : "light"
      }),
      Stream.changes,
      Stream.map((theme) => SiteHeaderMessage.ChangedTheme({ theme }))
    )
  })
)

const mutedLink =
  "text-muted-foreground motion-safe:transition-colors hover:text-foreground"

const menuLink = [
  "flex items-center gap-1.5 py-[11px] text-base",
  "text-muted-foreground hover:text-foreground",
  "aria-[current=page]:text-foreground"
].join(" ")

const gutter = [
  "mx-auto max-w-[1408px]",
  "pl-[max(16px,env(safe-area-inset-left,0px))]",
  "pr-[max(16px,env(safe-area-inset-right,0px))]"
].join(" ")

const socialLinks = <M>(h: Html.H<M>) =>
  socials.map(({ href, icon, label }) =>
    h.a.key(label).class(mutedLink).attrs({
      href,
      "aria-label": label
    }).children(icon(h))
  )

export const SiteHeader = Html.component({
  name: "SiteHeader",
  model: Schema.Struct({
    isMenuOpen: Schema.Boolean,
    theme: Theme
  }),
  message: SiteHeaderMessage
}).make({
  init: () => ({ isMenuOpen: false, theme: "light" as const }),
  update: {
    ClickedMenuToggle: ($) =>
      $.evolve({ isMenuOpen: (isOpen) => !isOpen }),
    ClickedMenuLink: ($) => $.evolve({ isMenuOpen: false }),
    ClickedOutside: ($) => $.evolve({ isMenuOpen: false }),
    PressedEscape: ($) =>
      $.evolve({ isMenuOpen: false }).run(
        HtmlCommand.focus(MenuToggle, () => Component.noop)
      ),
    ClickedThemeToggle: ($) => {
      const theme: Theme = $.model.theme === "dark" ? "light" : "dark"
      return $.evolve({ theme }).run(ApplyTheme.make({ theme }))
    },
    ChangedTheme: ($, { theme }) => $.evolve({ theme })
  },
  subscriptions: ({ model }) => [
    TrackTheme,
    model.isMenuOpen &&
    HtmlSubscription.shortcuts([{
      key: "Escape",
      message: SiteHeaderMessage.PressedEscape(),
      whileTyping: true
    }])
  ],
  view: (h, model) => {
    const menuId = h.id("menu")
    return h.header.class(
      "sticky top-0 z-30 h-(--site-header) border-b border-border",
      "bg-background/85 backdrop-blur-sm"
    ).children(
      NavigationMenu(h, {
        view: (menu) =>
          menu.root(
            h.nav.class(gutter, "flex h-full items-center").attr(
              "aria-label",
              "Main"
            )
          ).children(
            h.a.class("flex items-center text-foreground").attrs({
              href: "https://effect.website/",
              "aria-label": "Effect home"
            }).children(EffectWordmark(h)),
            h.div.class(
              "ml-8 flex items-center gap-4 max-[640px]:ml-5"
            ).children(
              h.a.class(
                "text-[15px] font-medium whitespace-nowrap text-foreground"
              ).attr("href", "/").children("Effect UI"),
              h.span.class(
                "h-[18px] w-px shrink-0 bg-border-strong",
                "max-[1024px]:hidden"
              ).attr("aria-hidden", "true")
            ),
            menu.list(
              h.ul.class(
                "ml-4 flex items-center gap-6 max-[1024px]:hidden"
              )
            ).children(
              links.map(({ active, href, label }) =>
                menu.item(h.li.key(label)).children(
                  menu.link({
                    element: h.a.class(
                      mutedLink,
                      "inline-flex items-center text-[15px]",
                      "whitespace-nowrap aria-[current=page]:text-foreground"
                    ).attr("href", href),
                    active
                  }).children(label)
                )
              )
            ),
            h.div.class("ml-auto flex items-center gap-4").children(
              h.div.class(
                "flex items-center gap-4 max-[640px]:hidden"
              ).children(socialLinks(h)),
              h.span.class(
                "h-[18px] w-px shrink-0 bg-border-strong",
                "max-[640px]:hidden"
              ).attr("aria-hidden", "true"),
              Button(h, {
                element: h.button,
                onPress: SiteHeaderMessage.ClickedThemeToggle()
              }).class(
                mutedLink,
                "inline-flex size-8 items-center justify-center rounded-md"
              ).attr(
                "aria-label",
                model.theme === "dark"
                  ? "Switch to light theme"
                  : "Switch to dark theme"
              ).children(
                Icon(h, model.theme === "dark" ? "moon" : "sun", {
                  class: "size-[19px]"
                })
              ),
              Button(h, {
                element: h.button.ref(MenuToggle),
                onPress: SiteHeaderMessage.ClickedMenuToggle()
              }).class(
                "-mr-2 hidden size-10 items-center justify-center",
                "text-prose-foreground hover:text-foreground",
                "max-[1024px]:inline-flex"
              ).attrs({
                "aria-expanded": String(model.isMenuOpen),
                "aria-controls": menuId,
                "aria-label": model.isMenuOpen
                  ? "Close menu"
                  : "Open menu"
              }).children(
                Icon(h, model.isMenuOpen ? "close" : "menu", {
                  class: "size-5"
                })
              )
            )
          )
      }),
      // Covers the page below the header, so a press outside the menu
      // closes it without reaching what is underneath.
      model.isMenuOpen &&
        h.div.class(
          "absolute inset-x-0 top-(--site-header)",
          "h-[calc(100dvh-var(--site-header))] min-[1024px]:hidden"
        ).attr("aria-hidden", "true").onClick(
          SiteHeaderMessage.ClickedOutside()
        ),
      model.isMenuOpen &&
        h.div.id(menuId).class(
          "absolute inset-x-0 top-full",
          "max-h-[calc(100dvh-var(--site-header))] overflow-y-auto",
          "border-b border-border bg-background",
          "[box-shadow:0_16px_24px_-16px_var(--color-ring)]",
          "min-[1024px]:hidden"
        ).children(
          h.ul.class(gutter, "pt-2 pb-4").children(
            links.map(({ active, href, label }) =>
              h.li.key(label).children(
                h.a.class(menuLink).attrs({
                  href,
                  "aria-current": active ? "page" : undefined
                }).onClick(SiteHeaderMessage.ClickedMenuLink())
                  .children(label)
              )
            ),
            h.li.key("effect.website").children(
              h.a.class(menuLink).attr(
                "href",
                "https://effect.website/"
              ).onClick(
                SiteHeaderMessage.ClickedMenuLink()
              ).children(
                "effect.website",
                Icon(h, "external", { class: "size-[13px]" })
              )
            ),
            h.li.key("socials").class(
              "mt-2 flex items-center gap-5 border-t border-border pt-4"
            ).children(
              socialLinks(h).map((link) =>
                link.onClick(SiteHeaderMessage.ClickedMenuLink())
              )
            )
          )
        )
    )
  }
})
