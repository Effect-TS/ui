import { Array as Arr, Schema } from "effect"

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

const matchesQuery = (person: Person, query: string): boolean => {
  const lowerQuery = query.toLowerCase()
  return person.name.toLowerCase().includes(lowerQuery) || person.role.toLowerCase().includes(lowerQuery)
}

export const searchPeople = (searchText: string): ReadonlyArray<Person> =>
  searchText === "" ? people : people.filter((person) => matchesQuery(person, searchText))

export const findPerson = (id: number) => Arr.findFirst(people, (person) => person.id === id)
