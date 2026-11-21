import type { View } from "@effect/ui"
import { AppRoute } from "../routes.ts"

export const NotFoundPage = <M>(h: View.H<M>, path: string) =>
  h.div.class("max-w-4xl mx-auto px-4").children(
    h.h1.class("text-4xl font-bold text-red-600 mb-6").children("404 - Page Not Found"),
    h.p.class("text-lg text-gray-600 mb-4").children(`The path "${path}" was not found.`),
    h.a.attr("href", AppRoute.print(AppRoute.Home())).class("text-blue-500 hover:underline").children("← Go Home")
  )
