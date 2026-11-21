import type { View } from "@effect/ui"
import { Option } from "effect"
import { findPerson } from "../../people/domain/Person.ts"
import { AppRoute } from "../../routes.ts"

const peopleUrl = AppRoute.print(AppRoute.People())

const Detail = <M>(h: View.H<M>, label: string, value: string) =>
  h.div.children(
    h.h2.class("text-sm font-medium text-gray-500 uppercase tracking-wide").children(label),
    h.p.class("text-lg text-gray-900 mt-1").children(value)
  )

export const PersonPage = <M>(h: View.H<M>, personId: number) =>
  Option.match(findPerson(personId), {
    onNone: () =>
      h.div.class("max-w-4xl mx-auto px-4").children(
        h.h2.class("text-4xl font-bold text-red-600 mb-6").children("Person Not Found"),
        h.p.class("text-lg text-gray-600 mb-4").children(`No person found with ID: ${personId}`),
        h.a.attr("href", peopleUrl).class("text-blue-500 hover:underline").children("← Back to People")
      ),
    onSome: (person) =>
      h.div.class("max-w-4xl mx-auto px-4").children(
        h.a.attr("href", peopleUrl).class("text-blue-500 hover:underline mb-4 inline-block")
          .children("← Back to People"),
        h.article.children(
          h.h2.class("text-4xl font-bold text-gray-800 mb-6").children(person.name),
          h.div.class("bg-gray-50 border border-gray-200 rounded-lg p-6").children(
            h.div.class("grid grid-cols-2 gap-4").children(
              Detail(h, "ID", String(person.id)),
              Detail(h, "Role", person.role)
            )
          )
        )
      )
  })
