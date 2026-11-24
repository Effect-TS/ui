import { FileTreeEntry, formatFileSize } from "#domain/FileTree"
import type { View } from "@effect/ui"
import { AppRoute } from "../routes.ts"

export const filesUrl = (path: ReadonlyArray<string>) =>
  AppRoute.print(AppRoute.Files({ params: { "*": path.join("/") } }))

const entryCountLabel = (count: number): string =>
  count === 1 ? "1 item" : `${count} items`

export const EntryList = <M>(
  h: View.H<M>,
  parentPath: ReadonlyArray<string>,
  entries: ReadonlyArray<FileTreeEntry>
) =>
  h.ul.class(["divide-y divide-gray-200 border border-gray-200 rounded-lg"])
    .children(
      entries.map((entry) =>
        h.li.key(entry.name).class([
          "flex items-center justify-between px-4 py-3"
        ]).children([
          h.a.attr("href", filesUrl([...parentPath, entry.name])).class([
            "text-blue-500 hover:underline"
          ])
            .children([entry.name]),
          h.span.class(["text-sm text-gray-500"]).children([
            FileTreeEntry.$match(entry, {
              File: ({ sizeInBytes }) => formatFileSize(sizeInBytes),
              Directory: ({ entries }) => entryCountLabel(entries.length)
            })
          ])
        ])
      )
    )
