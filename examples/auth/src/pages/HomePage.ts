import type { Html } from "@effect/ui/html"
import { AppRoute, LoggedOutRoute } from "../routes.ts"

const FeatureCard = <M>(h: Html.H<M>, title: string, description: string) =>
  h.div.class("bg-white rounded-lg shadow-md p-6").children(
    h.h2.class("text-xl font-semibold text-gray-800 mb-3").children(title),
    h.p.class("text-gray-600").children(description)
  )

export const HomePage = <M>(h: Html.H<M>) =>
  h.div.class("max-w-4xl mx-auto px-4").children(
    h.div.class("text-center py-16").children(
      h.h1.class("text-5xl font-bold text-gray-800 mb-6").children(
        "Welcome to Auth Example"
      ),
      h.p.class("text-xl text-gray-600 mb-8").children(
        "A demonstration of authentication with a Model union and route guards in Effect UI."
      ),
      h.a.attr("href", AppRoute.print(LoggedOutRoute.Login()))
        .class(
          "inline-block px-8 py-3 bg-blue-500 text-white font-medium rounded-lg hover:bg-blue-600 transition"
        )
        .children("Sign In")
    ),
    h.div.class("grid grid-cols-1 md:grid-cols-3 gap-8 mt-16").children(
      FeatureCard(
        h,
        "Model as Union",
        "App state is fundamentally LoggedOut | LoggedIn, not a flat struct with optional session."
      ),
      FeatureCard(
        h,
        "Route Guards",
        "Protected routes redirect to login. Auth routes redirect to dashboard when logged in."
      ),
      FeatureCard(
        h,
        "Session Persistence",
        "Session survives page refresh via localStorage, read into the root's props before it mounts."
      )
    )
  )
