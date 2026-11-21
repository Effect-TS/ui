import type { View } from "@effect/ui"

export const HomePage = <M>(h: View.H<M>) =>
  h.div.class("max-w-4xl mx-auto px-4").children(
    h.h1.class("text-4xl font-bold text-gray-800 mb-6").children("Welcome Home"),
    h.p.class("text-lg text-gray-600 mb-4").children(
      "This is a routing example built with Effect UI. Navigate using the links above to see different routes in action."
    )
  )
