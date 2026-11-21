import { Array, Data, Option } from "effect"

export type FileTreeEntry = Data.TaggedEnum<{
  File: { readonly name: string; readonly sizeInBytes: number }
  Directory: { readonly name: string; readonly entries: ReadonlyArray<FileTreeEntry> }
}>

export const FileTreeEntry = Data.taggedEnum<FileTreeEntry>()

const { Directory, File } = FileTreeEntry

export const fileTree: ReadonlyArray<FileTreeEntry> = [
  Directory({
    name: "documents",
    entries: [
      File({ name: "resume.pdf", sizeInBytes: 48_230 }),
      Directory({
        name: "taxes",
        entries: [
          File({ name: "2024.pdf", sizeInBytes: 182_400 }),
          File({ name: "2025.pdf", sizeInBytes: 196_812 })
        ]
      })
    ]
  }),
  Directory({
    name: "photos",
    entries: [
      Directory({
        name: "vacation",
        entries: [
          File({ name: "beach.jpg", sizeInBytes: 2_348_100 }),
          File({ name: "sunset.jpg", sizeInBytes: 1_982_450 })
        ]
      })
    ]
  }),
  File({ name: "notes.txt", sizeInBytes: 1_204 })
]

export const findEntry = (
  path: ReadonlyArray<string>,
  entries: ReadonlyArray<FileTreeEntry> = fileTree
): Option.Option<FileTreeEntry> => {
  const [name, ...rest] = path
  const entry = Array.findFirst(entries, (entry) => entry.name === name)
  return rest.length === 0
    ? entry
    : Option.flatMap(entry, (entry) =>
      FileTreeEntry.$match(entry, {
        File: () => Option.none(),
        Directory: ({ entries }) => findEntry(rest, entries)
      }))
}

const BYTES_PER_KILOBYTE = 1024
const BYTES_PER_MEGABYTE = BYTES_PER_KILOBYTE * 1024

export const formatFileSize = (sizeInBytes: number): string => {
  if (sizeInBytes >= BYTES_PER_MEGABYTE) {
    return `${(sizeInBytes / BYTES_PER_MEGABYTE).toFixed(1)} MB`
  }
  if (sizeInBytes >= BYTES_PER_KILOBYTE) {
    return `${(sizeInBytes / BYTES_PER_KILOBYTE).toFixed(1)} KB`
  }
  return `${sizeInBytes} B`
}
