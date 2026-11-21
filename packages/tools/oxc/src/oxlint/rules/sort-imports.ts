import type { CreateRule, ESTree, Fixer, Visitor } from "@oxlint/plugins"

interface ImportEntry {
  readonly node: ESTree.ImportDeclaration
  readonly source: string
  readonly group: number
  readonly index: number
  readonly start: number
  readonly end: number
  readonly text: string
  readonly hasInsideComments: boolean
}

const scopedPackagePattern = /^@[^/]+(?:\/.*)?$/
const blankLinePattern = /\r?\n[ \t]*\r?\n/

function getImportGroup(source: string): number {
  if (source.startsWith(".") || source.startsWith("@/") || source.startsWith("#")) {
    return 2
  }
  if (scopedPackagePattern.test(source)) {
    return 1
  }
  if (source.startsWith("node:") || !source.startsWith("/")) {
    return 0
  }
  return 3
}

function getEntryStart(
  node: ESTree.ImportDeclaration,
  text: string,
  leadingComments: ReadonlyArray<ESTree.Comment>,
  isFirstStatement: boolean,
  prevStmtEnd: number
): number {
  let entryStart = node.range[0]
  let nextStart = node.range[0]

  for (let i = leadingComments.length - 1; i >= 0; i--) {
    const comment = leadingComments[i]
    if (comment.range[0] < prevStmtEnd) {
      break
    }
    if (!isFirstStatement && !text.slice(prevStmtEnd, comment.range[0]).includes("\n")) {
      break
    }
    if ((comment.type as string) === "Shebang" || (comment.range[0] === 0 && text.startsWith("#!"))) {
      break
    }

    const gap = text.slice(comment.range[1], nextStart)
    if (blankLinePattern.test(gap)) {
      break
    }

    if (
      isFirstStatement &&
      comment.type === "Block" &&
      text.slice(comment.range[0], comment.range[0] + 3) === "/**"
    ) {
      break
    }

    entryStart = comment.range[0]
    nextStart = comment.range[0]
  }

  return entryStart
}

function getEntryEnd(
  node: ESTree.ImportDeclaration,
  text: string,
  trailingComments: ReadonlyArray<ESTree.Comment>,
  nextNodeStart: number
): number {
  let end = node.range[1]
  for (const comment of trailingComments) {
    if (comment.range[0] >= nextNodeStart) {
      break
    }
    if (text.slice(end, comment.range[0]).includes("\n")) {
      break
    }
    end = comment.range[1]
  }
  return end
}

function sortNamedSpecifiersInEntry(entry: ImportEntry, text: string): string {
  if (entry.hasInsideComments) return entry.text

  const named = entry.node.specifiers.filter(
    (s): s is ESTree.ImportSpecifier => s.type === "ImportSpecifier"
  )
  if (named.length < 2) return entry.text

  const sorted = [...named].sort((a, b) => a.local.name < b.local.name ? -1 : a.local.name > b.local.name ? 1 : 0)

  let changed = false
  for (let i = 0; i < named.length; i++) {
    if (named[i] !== sorted[i]) {
      changed = true
      break
    }
  }
  if (!changed) return entry.text

  let result = entry.text
  for (let i = named.length - 1; i >= 0; i--) {
    const targetStart = named[i].range[0] - entry.start
    const targetEnd = named[i].range[1] - entry.start
    const replacement = text.slice(sorted[i].range[0], sorted[i].range[1])
    result = result.slice(0, targetStart) + replacement + result.slice(targetEnd)
  }
  return result
}

function formatPartition(entries: ReadonlyArray<ImportEntry>, text: string): string {
  const sorted = [...entries].sort((a, b) =>
    a.group - b.group || (a.source < b.source ? -1 : a.source > b.source ? 1 : a.index - b.index)
  )
  let output = sortNamedSpecifiersInEntry(sorted[0], text)
  for (let i = 1; i < sorted.length; i++) {
    output += sorted[i].group !== sorted[i - 1].group ? "\n\n" : "\n"
    output += sortNamedSpecifiersInEntry(sorted[i], text)
  }
  return output
}

const rule: CreateRule = {
  meta: {
    type: "layout",
    docs: {
      description:
        "Group and sort import declarations and named imports while preserving side-effect boundaries and file headers"
    },
    fixable: "code"
  },
  create(context) {
    const sourceCode = context.sourceCode
    const text = sourceCode.text

    function checkPartition(entries: ReadonlyArray<ImportEntry>) {
      if (entries.length === 0) return
      const partitionStart = entries[0].start
      const partitionEnd = entries[entries.length - 1].end
      const original = text.slice(partitionStart, partitionEnd)
      const formatted = formatPartition(entries, text)
      if (formatted === original) return

      context.report({
        node: entries[0].node,
        message:
          "Imports should be grouped (builtin/external, scoped, local) with sorted declarations and named specifiers",
        fix: (fixer: Fixer) => fixer.replaceTextRange([partitionStart, partitionEnd], formatted)
      })
    }

    return {
      Program(program: ESTree.Program) {
        let partition: Array<ImportEntry> = []
        let prevStmtEnd = 0

        for (let i = 0; i < program.body.length; i++) {
          const stmt = program.body[i]
          if (stmt.type !== "ImportDeclaration" || stmt.specifiers.length === 0) {
            checkPartition(partition)
            partition = []
            prevStmtEnd = stmt.range[1]
            continue
          }

          const leadingComments = sourceCode.getCommentsBefore(stmt)
          const trailingComments = sourceCode.getCommentsAfter(stmt)
          const start = getEntryStart(stmt, text, leadingComments, i === 0, prevStmtEnd)
          const nextNodeStart = i + 1 < program.body.length ? program.body[i + 1].range[0] : text.length
          const end = getEntryEnd(stmt, text, trailingComments, nextNodeStart)

          if (partition.length > 0) {
            const prevEnd = partition[partition.length - 1].end
            if (text.slice(prevEnd, start).trim().length > 0) {
              checkPartition(partition)
              partition = []
            }
          }

          const source = stmt.source.value
          partition.push({
            node: stmt,
            source,
            group: getImportGroup(source),
            index: partition.length,
            start,
            end,
            text: text.slice(start, end),
            hasInsideComments: sourceCode.getCommentsInside(stmt).length > 0
          })
          prevStmtEnd = end
        }

        checkPartition(partition)
      }
    } as Visitor
  }
}

export default rule
