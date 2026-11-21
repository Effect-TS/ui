import type { View } from "@effect/ui"
import { fileTree } from "../../domain/FileTree.ts"
import { EntryList } from "../../files/components/EntryList.ts"

export const FilesIndexPage = <M>(h: View.H<M>) =>
  h.div.children(
    h.h1.class("text-4xl font-bold text-gray-800 mb-6").children("Files"),
    h.p.class("text-lg text-gray-600 mb-6").children(
      "Every path under /files parses into a single route that captures the remaining segments with a trailing *."
    ),
    EntryList(h, [], fileTree)
  )
