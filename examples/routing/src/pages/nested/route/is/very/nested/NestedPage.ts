import type { Html } from "@effect/ui/html"

export const NestedPage = <M>(h: Html.H<M>) =>
  h.div.children(
    h.h1.class("text-4xl font-bold text-gray-800 mb-6").children(
      "Very Nested Route!"
    ),
    h.p.class("text-lg text-gray-600").children(
      "You found the deeply nested route at /nested/route/is/very/nested"
    )
  )
