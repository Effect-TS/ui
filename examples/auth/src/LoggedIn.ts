import { Component, UiSchema } from "@effect/ui"
import { Schema } from "effect"
import { Session } from "./auth/domain/Session.ts"
import { DashboardPage } from "./pages/dashboard/DashboardPage.ts"
import { NotFound } from "./pages/NotFound.ts"
import { SettingsPage } from "./pages/settings/SettingsPage.ts"
import { AppRoute, dashboardRoute, LoggedInRoute, settingsRoute } from "./routes.ts"

export const LoggedInMessage = UiSchema.TaggedEnum({ ClickedSignOut: {} })

export const LoggedInEvents = UiSchema.TaggedEnum({ SignedOut: {} })

const LoggedInDef = Component.define({
  name: "LoggedIn",
  props: Schema.Struct({ route: LoggedInRoute, session: Session }),
  model: Schema.Null,
  message: LoggedInMessage,
  events: LoggedInEvents
})

const NavLink = LoggedInDef.fragment((h, label: string, route: LoggedInRoute) => {
  const active = route._tag === h.props.route._tag
  return h.li.children(
    h.a.attr("href", AppRoute.print(route))
      .attr("aria-current", active ? "page" : undefined)
      .class("hover:bg-blue-600 font-medium px-3 py-1 rounded transition", active && "bg-blue-700/50")
      .children(label)
  )
})

export const LoggedIn = LoggedInDef.make({
  init: () => null,

  update: (_model, _message, $) => $.emit(LoggedInEvents.SignedOut()),

  view: (_model, h) => {
    const { route, session } = h.props
    return h.div.class("min-h-screen").children(
      h.nav.class("bg-blue-500 text-white p-4").children(
        h.div.class("max-w-4xl mx-auto flex justify-between items-center").children(
          h.ul.class("flex gap-6 list-none").children(
            NavLink(h, "Dashboard", dashboardRoute),
            NavLink(h, "Settings", settingsRoute)
          ),
          h.div.class("text-sm").children(`Signed in as ${session.email}`)
        )
      ),
      h.main.class("py-8").children(
        LoggedInRoute.match(route, {
          Dashboard: () => DashboardPage(h, session),
          Settings: () => SettingsPage(h, { session, onSignOut: LoggedInMessage.ClickedSignOut() }),
          NotFound: (route) =>
            NotFound(h, {
              path: route.params["*"],
              backHref: AppRoute.print(dashboardRoute),
              backText: "Go to Dashboard"
            })
        })
      )
    )
  }
})
