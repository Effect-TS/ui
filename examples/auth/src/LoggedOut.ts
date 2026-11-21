import { Session } from "#domain/Session"
import { Component, UiSchema } from "@effect/ui"
import { Schema } from "effect"
import { HomePage } from "./pages/HomePage.ts"
import { LoginPage } from "./pages/login/LoginPage.ts"
import { NotFound } from "./pages/NotFound.ts"
import { AppRoute, LoggedOutRoute } from "./routes.ts"

export const LoggedOutMessage = UiSchema.TaggedEnum({ SignedInLogin: { session: Session } })

export const LoggedOutEvents = UiSchema.TaggedEnum({ SignedIn: { session: Session } })

export const LoggedOut = Component.define({
  name: "LoggedOut",
  props: Schema.Struct({ route: LoggedOutRoute }),
  model: Schema.Null,
  message: LoggedOutMessage,
  events: LoggedOutEvents
}).make({
  init: () => null,

  update: (_model, { session }, $) => $.emit(LoggedOutEvents.SignedIn({ session })),

  view: (_model, h) =>
    h.div.class("py-8").children(
      LoggedOutRoute.match(h.props.route, {
        Home: () => HomePage(h),
        Login: () =>
          LoginPage(h, { onEmit: { SignedIn: ({ session }) => LoggedOutMessage.SignedInLogin({ session }) } }),
        NotFound: (route) =>
          NotFound(h, { path: route.params["*"], backHref: AppRoute.print(LoggedOutRoute.Home()), backText: "Go Home" })
      })
    )
})
