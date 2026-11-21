import { Array as Arr, Option } from "effect"

export interface File {
  readonly _tag: "File"
  readonly name: string
  readonly sizeInBytes: number
}

export interface Directory {
  readonly _tag: "Directory"
  readonly name: string
  readonly entries: ReadonlyArray<FileTreeEntry>
}

export type FileTreeEntry = File | Directory

const file = (name: string, sizeInBytes: number): File => ({ _tag: "File", name, sizeInBytes })

const directory = (name: string, entries: ReadonlyArray<FileTreeEntry>): Directory => ({
  _tag: "Directory",
  name,
  entries
})

export const fileTree: ReadonlyArray<FileTreeEntry> = [
  directory("documents", [
    file("resume.pdf", 48_230),
    directory("taxes", [
      file("2024.pdf", 182_400),
      file("2025.pdf", 196_812)
    ])
  ]),
  directory("photos", [
    directory("vacation", [
      file("beach.jpg", 2_348_100),
      file("sunset.jpg", 1_982_450)
    ])
  ]),
  file("notes.txt", 1_204)
]

export const findEntry = (
  path: ReadonlyArray<string>,
  entries: ReadonlyArray<FileTreeEntry> = fileTree
): Option.Option<FileTreeEntry> => {
  const [name, ...rest] = path
  const entry = Arr.findFirst(entries, (entry) => entry.name === name)
  return rest.length === 0
    ? entry
    : Option.flatMap(entry, (entry) => entry._tag === "Directory" ? findEntry(rest, entry.entries) : Option.none())
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
