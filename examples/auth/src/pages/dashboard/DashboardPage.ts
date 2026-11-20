import type { View } from "@effect/ui"
import type { Session } from "../../auth/domain/Session.ts"

const StatCard = <M>(h: View.H<M>, title: string, value: string) =>
  h.div.class("bg-white rounded-lg shadow-md p-6").children(
    h.h2.class("text-sm font-medium text-gray-500 uppercase mb-1").children(title),
    h.p.class("text-3xl font-bold text-gray-800").children(value)
  )

export const DashboardPage = <M>(h: View.H<M>, session: Session) =>
  h.div.class("max-w-4xl mx-auto px-4").children(
    h.h1.class("text-4xl font-bold text-gray-800 mb-6").children(`Welcome back, ${session.name}!`),
    h.p.class("text-lg text-gray-600 mb-8").children("Here is your dashboard."),
    h.div.class("grid grid-cols-1 md:grid-cols-3 gap-6").children(
      StatCard(h, "Total Sessions", "42"),
      StatCard(h, "Active Projects", "7"),
      StatCard(h, "Tasks Completed", "128")
    )
  )
