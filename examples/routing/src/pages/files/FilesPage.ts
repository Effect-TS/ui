import type { View } from "@effect/ui"
import { Option } from "effect"
import { EntryList, filesUrl } from "../../files/components/EntryList.ts"
import { FileTreeEntry, findEntry, formatFileSize } from "../../files/domain/FileTree.ts"
import { AppRoute } from "../../routes.ts"

const filesIndexUrl = AppRoute.print(AppRoute.FilesIndex())

export const FilesPage = <M>(h: View.H<M>, path: ReadonlyArray<string>) =>
  h.div.children(
    h.nav.attr("aria-label", "Breadcrumb").class("flex flex-wrap items-center gap-2 mb-6 text-sm").children(
      h.a.attr("href", filesIndexUrl).class("text-blue-500 hover:underline").children("Files"),
      path.map((segment, index) => {
        const crumbPath = path.slice(0, index + 1)
        return h.span.key(crumbPath.join("/")).class("flex items-center gap-2").children(
          h.span.class("text-gray-400").children("/"),
          index === path.length - 1
            ? h.span.class("font-medium text-gray-800").children(segment)
            : h.a.attr("href", filesUrl(crumbPath)).class("text-blue-500 hover:underline").children(segment)
        )
      })
    ),
    Option.match(findEntry(path), {
      onNone: () =>
        h.div.children(
          h.h2.class("text-4xl font-bold text-red-600 mb-6").children("Nothing Here"),
          h.p.class("text-lg text-gray-600 mb-4").children(`No file or directory at "${path.join("/")}".`),
          h.a.attr("href", filesIndexUrl).class("text-blue-500 hover:underline").children("← Back to Files")
        ),
      onSome: FileTreeEntry.$match({
        File: ({ name, sizeInBytes }) =>
          h.div.class("bg-gray-50 border border-gray-200 rounded-lg p-6").children(
            h.h2.class("text-2xl font-bold text-gray-800 mb-2").children(name),
            h.p.class("text-gray-600").children(formatFileSize(sizeInBytes))
          ),
        Directory: ({ entries }) => EntryList(h, path, entries)
      })
    })
  )
