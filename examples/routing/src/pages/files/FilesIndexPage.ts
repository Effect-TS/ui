import { EntryList } from "#components/EntryList"
import { fileTree } from "#domain/FileTree"
import type { Html } from "@effect/ui/html"

export const FilesIndexPage = <M>(h: Html.H<M>) =>
  h.div.children(
    h.h1.class("text-4xl font-bold text-gray-800 mb-6").children("Files"),
    h.p.class("text-lg text-gray-600 mb-6").children(
      "Every path under /files parses into a single route that captures the remaining segments with a trailing *."
    ),
    EntryList(h, [], fileTree)
  )
