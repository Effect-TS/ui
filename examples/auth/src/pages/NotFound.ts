import type { View } from "@effect/ui"

export const NotFound = <M>(h: View.H<M>, options: {
  readonly path: string
  readonly backHref: string
  readonly backText: string
}) =>
  h.div.class("max-w-4xl mx-auto px-4 text-center").children(
    h.h1.class("text-4xl font-bold text-red-600 mb-6").children(
      "404 - Page Not Found"
    ),
    h.p.class("text-lg text-gray-600 mb-4").children(
      `The path "${options.path}" was not found.`
    ),
    h.a.attr("href", options.backHref).class("text-blue-500 hover:underline")
      .children(options.backText)
  )
