import type { Session } from "#domain/Session"
import type { View } from "@effect/ui"
import { Button } from "@effect/ui-kit"

const InfoRow = <M>(h: View.H<M>, label: string, value: string) =>
  h.div.class("flex justify-between items-center py-2 border-b border-gray-100")
    .children(
      h.p.class("text-gray-600").children(label),
      h.p.class("font-medium text-gray-800").children(value)
    )

export const SettingsPage = <M>(h: View.H<M>, options: {
  readonly session: Session
  readonly onSignOut: M
}) =>
  h.div.class("max-w-4xl mx-auto px-4").children(
    h.h1.class("text-4xl font-bold text-gray-800 mb-6").children("Settings"),
    h.div.class("bg-white rounded-lg shadow-md p-6 mb-6").children(
      h.h2.class("text-xl font-semibold text-gray-800 mb-4").children(
        "Account Information"
      ),
      h.div.class("space-y-4").children(
        InfoRow(h, "User ID", options.session.userId),
        InfoRow(h, "Email", options.session.email),
        InfoRow(h, "Name", options.session.name)
      )
    ),
    h.div.class("bg-white rounded-lg shadow-md p-6").children(
      h.h2.class("text-xl font-semibold text-gray-800 mb-4").children(
        "Actions"
      ),
      Button(h, { onPress: options.onSignOut })
        .class(
          "px-6 py-3 bg-red-500 text-white font-medium rounded-lg hover:bg-red-600 transition cursor-pointer"
        )
        .children("Sign Out")
    )
  )
