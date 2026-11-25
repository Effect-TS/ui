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

const readTheme = (): Theme => {
  const attr = document.documentElement.dataset.theme
  if (attr === "light" || attr === "dark") return attr
  try {
    const saved = localStorage.getItem(themeKey)
    if (saved === "light" || saved === "dark") return saved
  } catch {
    // Storage can throw in private browsing or restricted contexts.
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light"
}

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

const TrackTheme = Subscription.make(
  "theme",
  Stream.suspend(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    return Stream.fromEventListener(media, "change").pipe(
      Stream.prepend([undefined]),
      Stream.map(() => readTheme()),
      Stream.changes,
      Stream.map((theme) => SiteHeaderMessage.ChangedTheme({ theme }))
    )
  })
)

const EffectWordmark = <M>(h: Html.H<M>) =>
  h.el("svg").attrs({
    viewBox: "0 0 583 160",
    class: "block h-7 w-auto",
    fill: "currentColor",
    "aria-hidden": "true"
  }).children(
    h.el("path").attrs({
      "fill-rule": "evenodd",
      "clip-rule": "evenodd",
      d: "M160.058 47.1308C160.128 49.3649 159.201 51.3522 157.094 52.5262L136.298 64.1042L155.187 74.7413C157.319 75.9412 158.453 78.2081 158.275 80.4716C158.44 82.8041 157.547 84.9018 155.393 86.1173L83.99 126.323C82.4992 127.163 80.8003 127.324 79.268 126.903C78.5653 126.789 77.8713 126.551 77.2195 126.183L5.81948 85.9774C3.6881 84.7775 2.55464 82.5071 2.73248 80.2437C2.56759 77.9111 3.45934 75.8169 5.61403 74.6014L24.711 63.8487L4.12232 52.3846C3.50941 52.0428 2.97937 51.618 2.53479 51.1312C2.34228 50.9464 2.16532 50.7479 2.00734 50.5355C1.84332 50.3163 1.69916 50.0849 1.5783 49.8397C1.5196 49.6861 1.46521 49.5324 1.41428 49.3788L1.30465 49.0991L1.22782 48.8746C1.19156 48.7624 1.15962 48.6484 1.13027 48.5328L1.08193 48.3256C0.978336 47.8491 0.933447 47.3587 0.948986 46.8667C0.879062 44.6326 1.80534 42.6454 3.91255 41.4713L76.9372 0.813633C77.5501 0.471783 78.1976 0.242156 78.8545 0.116121C79.8317 -0.0720692 80.8296 -0.0289064 81.7671 0.226618C82.4854 0.344021 83.195 0.584006 83.8623 0.955207L156.884 41.6129C156.994 41.6733 157.1 41.7372 157.204 41.8045C157.302 41.8667 157.398 41.9306 157.491 41.9962C157.578 42.0583 157.662 42.1222 157.744 42.1878C158.008 42.3967 158.252 42.6246 158.474 42.8681C158.645 43.0338 158.803 43.2082 158.948 43.3929C159.133 43.6312 159.295 43.8867 159.428 44.1578C159.487 44.3114 159.541 44.4634 159.592 44.617C159.924 45.4095 160.085 46.2676 160.058 47.1308ZM20.2221 80.2471L80.5033 114.89L140.785 80.4716L124.112 70.8894L84.0694 93.1839C82.5441 94.0333 80.8072 94.1974 79.2395 93.7709C78.5213 93.6535 77.8117 93.4135 77.1444 93.0423L36.9796 70.6788L20.2221 80.2471Z"
    }),
    h.el("path").attr(
      "d",
      "M6.15788 112.795C7.7998 110.029 11.4307 109.095 14.2682 110.675L80.5033 148.311L146.934 110.81C149.771 109.228 153.769 110.345 155.044 112.93C156.25 116.091 155.685 119.247 152.839 120.832L83.8709 159.232C82.431 160.035 80.7899 160.188 79.3094 159.786C79.1273 159.757 78.946 159.719 78.7656 159.672C78.2744 159.546 77.7918 159.354 77.3317 159.099L8.36523 120.699C5.51648 119.113 4.51251 115.575 6.15788 112.795Z"
    ),
    h.el("path").attr(
      "d",
      "M408.882 133.847C385.813 133.847 370.338 116.366 370.338 94.8731C370.338 73.38 386.529 55.6123 408.882 55.6123C431.235 55.6123 446.71 73.38 446.71 94.8731C446.71 97.0224 446.567 99.315 446.137 101.751H390.398C392.547 110.491 399.138 116.653 408.882 116.653C417.193 116.653 423.641 112.354 427.079 106.623L442.125 117.942C436.107 127.256 423.641 133.847 408.882 133.847ZM390.398 87.2789H427.223C425.073 78.9682 418.052 72.2337 408.595 72.2337C399.425 72.2337 392.547 78.3951 390.398 87.2789Z"
    ),
    h.el("path").attr(
      "d",
      "M494.858 133.847C471.683 133.847 453.175 116.367 453.175 94.7313C453.175 73.0956 471.217 55.7585 495.947 55.6152C510.723 55.4719 522.699 60.7733 529.543 69.5136L513.367 81.6926C509.634 76.5344 503.413 73.2389 496.258 73.2389C482.882 73.2389 474.172 83.1254 474.172 94.7313C474.172 106.337 483.349 116.224 496.725 116.224C504.813 116.224 510.101 112.498 514.3 107.34L529.543 119.519C521.922 128.546 510.723 133.847 494.858 133.847Z"
    ),
    h.el("path").attr(
      "d",
      "M570.21 134C555.027 134 546.773 126.924 546.773 110.267V74.2997H536.012V57.3477H546.773V39.8062H566.673V57.3477H582.888V74.2997H566.673V109.235C566.673 114.1 569.031 116.311 572.864 116.311H581.119V134H570.21Z"
    ),
    h.el("path").attr(
      "d",
      "M279.853 51.7964C279.853 36.3186 289.877 26 305.355 26H313.61V42.9519H308.45C302.554 42.9519 299.753 46.0475 299.753 52.0912V56.9557H315.378V73.9077H299.753V133.608H279.853V73.9077H269.092V56.9557H279.853V51.7964Z"
    ),
    h.el("path").attr(
      "d",
      "M330.476 51.7964C330.476 36.3186 340.499 26 355.977 26H364.232V42.9519H359.073C353.177 42.9519 350.376 46.0475 350.376 52.0912V56.9557H366.001V73.9077H350.376V133.608H330.476V73.9077H319.715V56.9557H330.476V51.7964Z"
    ),
    h.el("path").attr(
      "d",
      "M200.061 133.788V30.6021H260.499V49.1755H220.699V72.3186H259.762V90.3024H220.699V115.214H260.794V133.788H200.061Z"
    )
  )

const GitHubIcon = <M>(h: Html.H<M>) =>
  h.el("svg").attrs({
    viewBox: "0 0 24 24",
    class: "block size-5",
    fill: "currentColor",
    "aria-hidden": "true"
  }).children(
    h.el("path").attr(
      "d",
      "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"
    )
  )

const DiscordIcon = <M>(h: Html.H<M>) =>
  h.el("svg").attrs({
    viewBox: "0 0 24 24",
    class: "block size-5",
    fill: "currentColor",
    "aria-hidden": "true"
  }).children(
    h.el("path").attr(
      "d",
      "M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .078-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"
    )
  )

const iconLink =
  "text-muted-foreground motion-safe:transition-colors hover:text-foreground"

const gutter = [
  "mx-auto max-w-[1408px]",
  "pl-[max(16px,env(safe-area-inset-left,0px))]",
  "pr-[max(16px,env(safe-area-inset-right,0px))]"
].join(" ")

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
    HtmlSubscription.onDocument(
      "keydown",
      ({ key }) =>
        key === "Escape"
          ? SiteHeaderMessage.PressedEscape()
          : undefined
    )
  ],
  view: (h, model) => {
    const menuId = h.id("menu")
    return h.header.class(
      "sticky top-0 z-30 h-(--site-header) border-b border-border"
    ).children(
      // Kept on a sibling layer so backdrop-filter doesn't trap the
      // fixed menu backdrop inside the 64px header.
      h.div.class(
        "pointer-events-none absolute inset-0 bg-background/85",
        "backdrop-blur-sm"
      ).attr("aria-hidden", "true"),
      NavigationMenu(h, {
        view: (menu) =>
          menu.root(
            h.nav.class(
              gutter,
              "relative z-10 flex h-full items-center"
            ).attr("aria-label", "Main")
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
                      "inline-flex items-center text-[15px]",
                      "whitespace-nowrap text-muted-foreground",
                      "motion-safe:transition-colors hover:text-foreground",
                      "aria-[current=page]:text-foreground"
                    ).attr("href", href),
                    active
                  }).children(label)
                )
              )
            ),
            h.div.class("ml-auto flex items-center gap-4").children(
              h.div.class(
                "flex items-center gap-4 max-[640px]:hidden"
              ).children(
                h.a.class(iconLink).attrs({
                  href: "https://github.com/Effect-TS/ui",
                  "aria-label": "Effect UI on GitHub"
                }).children(GitHubIcon(h)),
                h.a.class(iconLink).attrs({
                  href: "https://discord.gg/effect-ts",
                  "aria-label": "Effect Discord"
                }).children(DiscordIcon(h))
              ),
              h.span.class(
                "h-[18px] w-px shrink-0 bg-border-strong",
                "max-[640px]:hidden"
              ).attr("aria-hidden", "true"),
              Button(h, {
                element: h.button,
                onPress: SiteHeaderMessage.ClickedThemeToggle()
              }).class(
                "inline-flex size-8 items-center justify-center",
                "rounded-md text-muted-foreground",
                "motion-safe:transition-colors hover:text-foreground"
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
      model.isMenuOpen &&
        h.div.class(
          "fixed inset-0 top-(--site-header) min-[1024px]:hidden"
        ).attr("aria-hidden", "true").onClick(
          SiteHeaderMessage.ClickedOutside()
        ),
      model.isMenuOpen &&
        h.div.id(menuId).class(
          "absolute inset-x-0 top-full z-10",
          "max-h-[calc(100dvh-var(--site-header))] overflow-y-auto",
          "border-b border-border bg-background",
          "[box-shadow:0_16px_24px_-16px_var(--color-ring)]",
          "min-[1024px]:hidden"
        ).children(
          h.ul.class(gutter, "pt-2 pb-4").children(
            links.map(({ active, href, label }) =>
              h.li.key(label).children(
                h.a.class(
                  "flex items-center gap-1.5 py-[11px] text-base",
                  "text-muted-foreground hover:text-foreground",
                  "aria-[current=page]:text-foreground"
                ).attrs({
                  href,
                  "aria-current": active ? "page" : undefined
                }).onClick(SiteHeaderMessage.ClickedMenuLink())
                  .children(label)
              )
            ),
            h.li.key("effect.website").children(
              h.a.class(
                "flex items-center gap-1.5 py-[11px] text-base",
                "text-muted-foreground hover:text-foreground"
              ).attr("href", "https://effect.website/").onClick(
                SiteHeaderMessage.ClickedMenuLink()
              ).children(
                "effect.website",
                Icon(h, "external", { class: "size-[13px]" })
              )
            ),
            h.li.key("socials").class(
              "mt-2 flex items-center gap-5 border-t border-border pt-4"
            ).children(
              h.a.class(iconLink).attrs({
                href: "https://github.com/Effect-TS/ui",
                "aria-label": "Effect UI on GitHub"
              }).onClick(SiteHeaderMessage.ClickedMenuLink())
                .children(
                  GitHubIcon(h)
                ),
              h.a.class(iconLink).attrs({
                href: "https://discord.gg/effect-ts",
                "aria-label": "Effect Discord"
              }).onClick(SiteHeaderMessage.ClickedMenuLink())
                .children(
                  DiscordIcon(h)
                )
            )
          )
        )
    )
  }
})
