import { Array, Schema } from "effect"

export const Person = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  role: Schema.String
})
export type Person = typeof Person.Type

const people: ReadonlyArray<Person> = [
  { id: 1, name: "Alice Johnson", role: "Designer" },
  { id: 2, name: "Bob Smith", role: "Developer" },
  { id: 3, name: "Carol Davis", role: "Manager" },
  { id: 4, name: "David Wilson", role: "Developer" },
  { id: 5, name: "Eva Brown", role: "Designer" }
]

export const searchPeople = (searchText: string): ReadonlyArray<Person> => {
  const query = searchText.toLowerCase()
  return people.filter((person) =>
    person.name.toLowerCase().includes(query) || person.role.toLowerCase().includes(query)
  )
}

export const findPerson = (id: number) => Array.findFirst(people, (person) => person.id === id)
