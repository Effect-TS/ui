import * as Option from "effect/Option"
import * as Result from "effect/Result"
import type * as Markdown from "../Markdown.ts"
import { isAllowedUrl, unsupportedUrl } from "../Markdown.ts"
import { entities } from "./markdownEntities.ts"

/** @internal */
export interface Problem {
  readonly line: number
  readonly column: number
  readonly message: string
}

/** @internal */
export interface Options {
  readonly island?:
    | ((name: string, attributes: Readonly<Record<string, string>>, line: number) => string | undefined)
    | undefined
}

const guidance = {
  yaml:
    "Frontmatter is not supported without a `frontmatter` schema in the Markdown options. Pass one to enable it, or keep document metadata in application code.",
  html: "Raw HTML is not part of the markdown vocabulary. Use an island directive to render custom views.",
  textDirective:
    "Inline directives are not supported. Use a leaf directive (`::Name`) on its own line, or a container directive (`:::Name`).",
  linkReference: "Reference-style links are not supported. Use an inline link (`[text](url)`).",
  imageReference: "Reference-style images are not supported. Use an inline image (`![alt](url)`).",
  definition: "Reference-style link definitions are not supported. Use inline links (`[text](url)`).",
  footnoteReference: "Footnotes are not supported.",
  footnoteDefinition: "Footnotes are not supported.",
  "task list item": "Task list items are not supported.",
  "leaf directive label":
    "Leaf directive labels (`::Name[label]`) are not supported. Pass information through attributes (`::Name{label=\"...\"}`) instead."
}

/** @internal */
export const unsupported = (type: keyof typeof guidance, line: number): string =>
  `Unsupported markdown node "${type}" (line ${line}). ${guidance[type]}`

const ESCAPABLE = "[!\"#$%&'()*+,./:;<=>?@[\\\\\\]^_`{|}~-]"
const ENTITY = "&(?:#[xX][0-9a-fA-F]{1,6}|#[0-9]{1,7}|[A-Za-z][A-Za-z0-9]{1,31});"
const reEntityHere = new RegExp("^" + ENTITY)
const reEscapedOrEntity = new RegExp("\\\\(" + ESCAPABLE + ")|" + ENTITY, "g")
const reEscapable = new RegExp("^" + ESCAPABLE)
const TAG_NAME = "[A-Za-z][A-Za-z0-9-]*"
const ATTRIBUTE = "(?:\\s+[a-zA-Z_:][a-zA-Z0-9:._-]*(?:\\s*=\\s*(?:[^\"'=<>`\\x00-\\x20]+|'[^']*'|\"[^\"]*\"))?)"
const reHtmlTag = new RegExp(
  "^(?:<" + TAG_NAME + ATTRIBUTE +
    "*\\s*/?>|</" + TAG_NAME +
    "\\s*>|<!-->|<!--->|<!--[\\s\\S]*?-->|<[?][\\s\\S]*?[?]>|<![A-Za-z]+[^>]*>|<!\\[CDATA\\[[\\s\\S]*?\\]\\]>)"
)
const reHtmlBlock =
  /^<(?:(?:script|pre|textarea|style)(?:\s|>|$)|!--|[?]|![A-Za-z]|!\[CDATA\[|\/?(?:address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)(?:\s|\/?>|$))/i
const reThematicBreak = /^(?:\*[ \t]*){3,}$|^(?:_[ \t]*){3,}$|^(?:-[ \t]*){3,}$/
const NAME = "[^\\s\\p{P}\\p{S}](?:[^\\s\\p{P}\\p{S}]|[-_](?=[-_]*[^\\s\\p{P}\\p{S}]))*"
const reDirective = new RegExp(
  "^(:{2,})(" + NAME + ")(?:\\[((?:[^[\\]]|\\[[^[\\]]*\\])*)\\])?(\\{(?:\"[^\"]*\"|'[^']*'|[^}\"'])*\\})?[ \\t]*$",
  "u"
)
const reTextDirective = new RegExp("^:" + NAME + "(?:\\[[^\\]\\n]*\\]|\\{[^}\\n]*\\})", "u")
const reLoneTextDirective = new RegExp("^:" + NAME + "[ \\t]*(?:\\n|$)", "u")
const reDelimiterRow = /^\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/
const reEmailAutolink =
  /^<([a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*)>/
// oxlint-disable-next-line no-control-regex
const reUriAutolink = /^<([A-Za-z][A-Za-z0-9.+-]{1,31}:[^<>\x00-\x20]*)>/
const rePunctuation = /^[\p{P}\p{S}]/u
const reSpaceOrPunctuation = /[\s\p{P}\p{S}]/u
const replacementCharacter = String.fromCharCode(0xfffd)

const isSpaceOrTab = (char: string | undefined): boolean => char === " " || char === "\t"

const splitRow = (row: string): Array<string> => {
  const trimmed = row.trim().replace(/^\|/, "")
  const cells: Array<string> = []
  let current = ""
  let closed = false
  for (let i = 0; i < trimmed.length; i++) {
    closed = trimmed[i] === "|"
    if (trimmed[i] === "\\" && i + 1 < trimmed.length) {
      current += trimmed[i + 1] === "|" ? "|" : trimmed[i] + trimmed[i + 1]
      i++
    } else if (closed) {
      cells.push(current)
      current = ""
    } else {
      current += trimmed[i]
    }
  }
  if (!closed) {
    cells.push(current)
  }
  return cells.map((cell) => cell.trim())
}

const decodeEntity = (entity: string): string => {
  const body = entity.slice(1, -1)
  if (body[0] !== "#") {
    return Object.hasOwn(entities, body) ? entities[body] : entity
  }
  const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
  const invalid = code < 9 || code === 11 || (code > 13 && code < 32) || (code > 126 && code < 160) ||
    (code > 0xd7ff && code < 0xe000) || (code > 0xfdcf && code < 0xfdf0) || (code & 0xffff) > 0xfffd ||
    code > 0x10ffff
  return invalid ? replacementCharacter : String.fromCodePoint(code)
}

const unescape = (text: string): string =>
  text.replace(reEscapedOrEntity, (match, escaped: string | undefined) => escaped ?? decodeEntity(match))

const reEntity = new RegExp(ENTITY, "g")
const reAttribute =
  /^(?:([#.])([^\s"#'.<=>`}]+)|([A-Za-z:_][\w.:-]*)(?:[ \t]*=[ \t]*(?:"([^"]*)"|'([^']*)'|([^\s"'<=>`}]+)))?)/

const parseAttributes = (text: string | undefined): Record<string, string> | undefined => {
  const attributes: Record<string, string> = {}
  let rest = text?.slice(1, -1).trimStart() ?? ""
  while (rest !== "") {
    const match = reAttribute.exec(rest)
    if (match === null) {
      return undefined
    }
    const [whole, shortcut, shortcutValue, name, double, single, bare] = match
    const key = shortcut === "#" ? "id" : shortcut === "." ? "class" : name
    const value = (shortcutValue ?? double ?? single ?? bare ?? "").replace(reEntity, decodeEntity)
    attributes[key] = key === "class" && Object.hasOwn(attributes, "class") ? `${attributes.class} ${value}` : value
    rest = rest.slice(whole.length)
    const gap = /^[ \t]*/.exec(rest)?.[0] ?? ""
    if (gap === "" && rest !== "" && (shortcut === undefined || !/^[#.]/.test(rest))) {
      return undefined
    }
    rest = rest.slice(gap.length)
  }
  return attributes
}

type BlockType =
  | "document"
  | "blockquote"
  | "item"
  | "directive"
  | "list"
  | "heading"
  | "thematicBreak"
  | "paragraph"
  | "code"
  | "table"

interface BlockNode {
  type: BlockType
  parent: BlockNode | undefined
  children: Array<BlockNode>
  open: boolean
  line: number
  text: string
  level: Markdown.HeadingLevel
  fenced: boolean
  fenceLength: number
  fenceChar: string
  fenceOffset: number
  info: string
  ordered: boolean
  start: number | null
  delimiter: string
  markerOffset: number
  padding: number
  leaf: boolean
  name: string
  label: string | undefined
  attributes: Record<string, string>
  header: Array<string>
  alignments: Array<Markdown.Alignment>
}

interface ListMarker {
  readonly ordered: boolean
  readonly start: number | null
  readonly delimiter: string
  readonly width: number
}

type RawText = { readonly _tag: "Text"; value: string }
type RawInline =
  | RawText
  | { readonly _tag: "InlineCode"; readonly value: string }
  | { readonly _tag: "HardBreak" }
  | { readonly _tag: "Emphasis" | "Strong" | "Strikethrough"; readonly content: Array<RawInline> }
  | {
    readonly _tag: "Link"
    readonly url: string
    readonly title: Option.Option<string>
    readonly content: Array<RawInline>
  }
  | { readonly _tag: "Image"; readonly url: string; readonly alt: string; readonly title: Option.Option<string> }

interface Delimiter {
  readonly char: string
  count: number
  readonly original: number
  readonly node: RawText
  previous: Delimiter | null
  next: Delimiter | null
  readonly canOpen: boolean
  readonly canClose: boolean
}

interface Bracket {
  readonly node: RawText
  readonly previous: Bracket | null
  readonly previousDelimiter: Delimiter | null
  readonly index: number
  readonly image: boolean
  active: boolean
  bracketAfter: boolean
}

const textOf = (node: RawInline): string => {
  switch (node._tag) {
    case "Text":
    case "InlineCode":
      return node.value
    case "Image":
      return node.alt
    case "HardBreak":
      return ""
    default:
      return plainText(node.content)
  }
}

const plainText = (nodes: ReadonlyArray<RawInline>): string => nodes.map(textOf).join("")

const tidy = (nodes: ReadonlyArray<RawInline>): Array<RawInline> => {
  const out: Array<RawInline> = []
  for (const node of nodes) {
    const last = out.at(-1)
    if (node._tag !== "Text") {
      out.push("content" in node ? { ...node, content: tidy(node.content) } : node)
    } else if (last?._tag === "Text") {
      last.value += node.value
    } else if (node.value !== "") {
      out.push({ ...node })
    }
  }
  return out
}

const emails = (node: RawInline): Array<RawInline> => {
  if (node._tag === "Emphasis" || node._tag === "Strong" || node._tag === "Strikethrough") {
    return [{ ...node, content: node.content.flatMap(emails) }]
  }
  if (node._tag !== "Text") {
    return [node]
  }
  const out: Array<RawInline> = []
  let index = 0
  for (const found of node.value.matchAll(/([-.\w+]+)@([-\w]+(?:\.[-\w]+)+)/g)) {
    const before = node.value[found.index - 1]
    const after = node.value[found.index + found[0].length]
    if (before === "/" || /[-\d_]$/.test(found[2]) || after === "-" || after === "_") {
      continue
    }
    if (found.index > index) {
      out.push({ _tag: "Text", value: node.value.slice(index, found.index) })
    }
    out.push({
      _tag: "Link",
      url: "mailto:" + found[0],
      title: Option.none(),
      content: [{ _tag: "Text", value: found[0] }]
    })
    index = found.index + found[0].length
  }
  if (index < node.value.length) {
    out.push({ _tag: "Text", value: node.value.slice(index) })
  }
  return out
}

const nonEmpty = Option.liftPredicate((text: string) => text !== "")

// Lowering then raising the case folds a label as CommonMark matches it, so "ẞ" matches "SS".
const normalizeLabel = (label: string): string => label.trim().replace(/[ \t\n]+/g, " ").toLowerCase().toUpperCase()

/** @internal */
export const parse = (
  input: string,
  options: Options = {}
): Result.Result<Markdown.Document, Problem> => {
  const problems: Array<Problem> = []
  const report = (type: keyof typeof guidance, line: number, column = 0) =>
    problems.push({ line, column, message: unsupported(type, line) })
  const definitions = new Set<string>()
  const footnotes = new Set<string>()

  const lines = input.replace(/\0/g, replacementCharacter).split(/\r\n|\n|\r/)
  if (lines.at(-1) === "") {
    lines.pop()
  }
  const makeBlock = (type: BlockType, parent: BlockNode | undefined, line: number): BlockNode => ({
    type,
    parent,
    children: [],
    open: true,
    line,
    text: "",
    level: 1,
    fenced: false,
    fenceLength: 0,
    fenceChar: "",
    fenceOffset: 0,
    info: "",
    ordered: false,
    start: null,
    delimiter: "",
    markerOffset: 0,
    padding: 0,
    leaf: false,
    name: "",
    label: undefined,
    attributes: {},
    header: [],
    alignments: []
  })
  const document = makeBlock("document", undefined, 1)
  let tip: BlockNode | undefined = document
  let oldTip: BlockNode = document
  let lastMatched: BlockNode = document
  let allClosed = true
  let line = ""
  let lineNumber = 0
  let offset = 0
  let column = 0
  let nextNonspace = 0
  let nextNonspaceColumn = 0
  let indent = 0
  let indented = false
  let blank = false
  let partialTab = false

  const current = (): BlockNode => tip ?? document
  const findNextNonspace = () => {
    let i = offset
    let columns = column
    for (; isSpaceOrTab(line[i]); i++) {
      columns += line[i] === " " ? 1 : 4 - (columns % 4)
    }
    blank = i >= line.length
    nextNonspace = i
    nextNonspaceColumn = columns
    indent = columns - column
    indented = indent >= 4
  }
  const advanceNextNonspace = () => {
    offset = nextNonspace
    column = nextNonspaceColumn
    partialTab = false
  }
  const advanceOffset = (count: number, columns: boolean) => {
    while (count > 0 && offset < line.length) {
      if (line[offset] === "\t") {
        const toTab = 4 - (column % 4)
        if (columns) {
          partialTab = toTab > count
          const advance = Math.min(count, toTab)
          column += advance
          offset += partialTab ? 0 : 1
          count -= advance
        } else {
          partialTab = false
          column += toTab
          offset += 1
          count -= 1
        }
      } else {
        partialTab = false
        offset += 1
        column += 1
        count -= 1
      }
    }
  }
  const advanceToEnd = () => {
    offset = line.length
    partialTab = false
  }
  const rest = () => line.slice(nextNonspace)
  const addLine = () => {
    const block = current()
    if (partialTab) {
      offset += 1
      block.text += " ".repeat(4 - (column % 4))
    }
    block.text += line.slice(offset) + "\n"
  }
  const isContainer = (type: BlockType) =>
    type === "document" || type === "blockquote" || type === "item" || type === "directive"
  const canContain = (parent: BlockNode, type: BlockType) =>
    parent.type === "list" ? type === "item" : isContainer(parent.type) && !parent.leaf && type !== "item"
  const acceptsLines = (type: BlockType) => type === "paragraph" || type === "code" || type === "table"
  const remove = (block: BlockNode) => {
    const siblings = block.parent?.children ?? []
    siblings.splice(siblings.indexOf(block), 1)
  }

  const stripDefinitions = (block: BlockNode) => {
    for (;;) {
      const footnote = /^\[\^([^\]\s]+)\]:/.exec(block.text)
      if (footnote !== null) {
        footnotes.add(normalizeLabel(footnote[1]))
        report("footnoteDefinition", block.line)
        block.text = ""
        return
      }
      const definition =
        /^\[((?:[^\\[\]]|\\[\s\S]){1,999})\]:[ \t]*\n?[ \t]*(?:<((?:[^<>\n\\]|\\.)*)>|([^\s<][^\s]*))(?:(?:[ \t]+|[ \t]*\n[ \t]*)("(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|\((?:\\[\s\S]|[^()\\])*\))[ \t]*(?:\n|$)|[ \t]*(?:\n|$))/
          .exec(block.text)
      if (definition === null || definition[1].trim() === "") {
        return
      }
      definitions.add(normalizeLabel(definition[1]))
      report("definition", block.line)
      const consumed = definition[0]
      block.line += consumed.split("\n").length - 1
      block.text = block.text.slice(consumed.length)
    }
  }
  const finalize = (block: BlockNode) => {
    block.open = false
    if (block.type === "paragraph") {
      stripDefinitions(block)
      if (block.text.trim() === "") {
        remove(block)
      }
    } else if (block.type === "code" && block.fenced) {
      const newline = block.text.indexOf("\n")
      block.info = unescape(block.text.slice(0, newline).trimStart())
      block.text = block.text.slice(newline + 1)
    } else if (block.type === "code") {
      block.text = block.text.replace(/(?:\n[ \t]*)+$/, "\n")
    }
    tip = block.parent
  }
  const addChild = (type: BlockType, fields?: Partial<BlockNode>): BlockNode => {
    while (!canContain(current(), type)) {
      finalize(current())
    }
    const parent = current()
    const child = Object.assign(makeBlock(type, parent, lineNumber), fields)
    parent.children.push(child)
    tip = child
    return child
  }
  const closeUnmatched = () => {
    if (allClosed) {
      return
    }
    while (oldTip !== lastMatched) {
      const parent = oldTip.parent ?? document
      finalize(oldTip)
      oldTip = parent
    }
    allClosed = true
  }

  const blockquoteMarker = (): boolean => {
    if (indented || line[nextNonspace] !== ">") {
      return false
    }
    advanceNextNonspace()
    advanceOffset(1, false)
    if (isSpaceOrTab(line[offset])) {
      advanceOffset(1, true)
    }
    return true
  }

  const MATCHED = 0
  const NO_MATCH = 1
  const CONSUMED = 2
  const continues = (block: BlockNode): number => {
    switch (block.type) {
      case "document":
      case "list":
        return MATCHED
      case "heading":
      case "thematicBreak":
        return NO_MATCH
      case "paragraph":
        return blank ? NO_MATCH : MATCHED
      case "blockquote":
        return blockquoteMarker() ? MATCHED : NO_MATCH
      case "item":
        if (blank) {
          if (block.children.length === 0) {
            return NO_MATCH
          }
          advanceNextNonspace()
        } else if (indent >= block.markerOffset + block.padding) {
          advanceOffset(block.markerOffset + block.padding, true)
        } else {
          return NO_MATCH
        }
        return MATCHED
      case "code":
        if (block.fenced) {
          const closing = indent <= 3 && line[nextNonspace] === block.fenceChar
            ? /^(?:`{3,}|~{3,})(?=[ \t]*$)/.exec(rest())
            : null
          if (closing !== null && closing[0].length >= block.fenceLength) {
            finalize(block)
            return CONSUMED
          }
          for (let i = block.fenceOffset; i > 0 && isSpaceOrTab(line[offset]); i--) {
            advanceOffset(1, true)
          }
        } else if (indent >= 4) {
          advanceOffset(4, true)
        } else if (blank) {
          advanceNextNonspace()
        } else {
          return NO_MATCH
        }
        return MATCHED
      case "table":
        return blank || indented || startsBlock() ? NO_MATCH : MATCHED
      case "directive": {
        if (block.leaf) {
          return NO_MATCH
        }
        const closing = indented ? null : /^:{3,}(?=[ \t]*$)/.exec(rest())
        if (closing === null || closing[0].length < block.fenceLength) {
          return MATCHED
        }
        for (let open = tip; open !== undefined && open !== block; open = tip) {
          finalize(open)
        }
        finalize(block)
        return CONSUMED
      }
    }
  }

  const parseListMarker = (container: BlockNode): ListMarker | null => {
    const text = rest()
    const bullet = /^[*+-]/.exec(text)
    const ordered = bullet === null ? /^(\d{1,9})([.)])/.exec(text) : null
    const marker = bullet ?? ordered
    if (marker === null || (ordered !== null && container.type === "paragraph" && ordered[1] !== "1")) {
      return null
    }
    const after = line[nextNonspace + marker[0].length]
    if (after !== undefined && !isSpaceOrTab(after)) {
      return null
    }
    if (container.type === "paragraph" && line.slice(nextNonspace + marker[0].length).trim() === "") {
      return null
    }
    return {
      ordered: ordered !== null,
      start: ordered === null ? null : parseInt(ordered[1], 10),
      delimiter: marker[0].slice(-1),
      width: marker[0].length
    }
  }

  const NONE = 0
  const CONTAINER = 1
  const LEAF = 2
  const LEAF_CONSUMED = 3
  const starts: ReadonlyArray<(container: BlockNode) => number> = [
    () => {
      if (!blockquoteMarker()) {
        return NONE
      }
      closeUnmatched()
      addChild("blockquote")
      return CONTAINER
    },
    () => {
      const match = indented ? null : /^#{1,6}(?:[ \t]+|$)/.exec(rest())
      if (match === null) {
        return NONE
      }
      advanceNextNonspace()
      advanceOffset(match[0].length, false)
      closeUnmatched()
      addChild("heading", { level: match[0].trim().length as Markdown.HeadingLevel }).text = line.slice(offset)
        .replace(/^[ \t]*#+[ \t]*$/, "").replace(/[ \t]+#+[ \t]*$/, "")
      advanceToEnd()
      return LEAF
    },
    () => {
      const match = indented ? null : /^`{3,}(?!.*`)|^~{3,}/.exec(rest())
      if (match === null) {
        return NONE
      }
      closeUnmatched()
      addChild("code", { fenced: true, fenceLength: match[0].length, fenceChar: match[0][0], fenceOffset: indent })
      advanceNextNonspace()
      advanceOffset(match[0].length, false)
      return LEAF
    },
    () => {
      if (!indented && reHtmlBlock.test(rest())) {
        report("html", lineNumber)
      }
      return NONE
    },
    (container) => {
      const match = indented || container.type !== "paragraph" ? null : /^(?:=+|-+)[ \t]*$/.exec(rest())
      if (match === null) {
        return NONE
      }
      closeUnmatched()
      stripDefinitions(container)
      if (container.text.trim() === "") {
        return NONE
      }
      container.type = "heading"
      container.level = match[0][0] === "=" ? 1 : 2
      advanceToEnd()
      return LEAF
    },
    () => {
      if (indented || !reThematicBreak.test(rest())) {
        return NONE
      }
      closeUnmatched()
      addChild("thematicBreak")
      advanceToEnd()
      return LEAF
    },
    (container) => {
      const marker = indented ? null : parseListMarker(container)
      if (marker === null) {
        return NONE
      }
      const markerOffset = indent
      advanceNextNonspace()
      advanceOffset(marker.width, true)
      const startColumn = column
      const startOffset = offset
      let spaces = 0
      do {
        advanceOffset(1, true)
        spaces = column - startColumn
      } while (spaces < 5 && isSpaceOrTab(line[offset]))
      let padding = marker.width + spaces
      if (spaces >= 5 || spaces < 1 || offset >= line.length) {
        padding = marker.width + 1
        column = startColumn
        offset = startOffset
        if (isSpaceOrTab(line[offset])) {
          advanceOffset(1, true)
        }
      }
      closeUnmatched()
      const list = current()
      if (list.type !== "list" || list.ordered !== marker.ordered || list.delimiter !== marker.delimiter) {
        addChild("list", { ordered: marker.ordered, start: marker.start, delimiter: marker.delimiter })
      }
      addChild("item", { markerOffset, padding })
      return CONTAINER
    },
    () => {
      const match = indented ? null : reDirective.exec(rest())
      if (match === null) {
        return NONE
      }
      closeUnmatched()
      const leaf = match[1].length === 2
      const attributes = parseAttributes(match[4])
      if (attributes === undefined) {
        problems.push({
          line: lineNumber,
          column: 0,
          message: `Malformed attributes ${match[4]} on island "${
            match[2]
          }" (line ${lineNumber}). Write each attribute as name="value", separated by spaces.`
        })
      }
      addChild("directive", {
        leaf,
        fenceLength: match[1].length,
        name: match[2],
        label: leaf && match[3] === "" ? undefined : match[3],
        attributes: attributes ?? {}
      })
      advanceToEnd()
      return leaf ? LEAF : CONTAINER
    },
    (container) => {
      if (indented || container.type !== "paragraph" || !reDelimiterRow.test(rest())) {
        return NONE
      }
      const paragraphLines = container.text.slice(0, -1).split("\n")
      const header = splitRow(paragraphLines[paragraphLines.length - 1])
      const delimiters = splitRow(rest())
      if (header.length !== delimiters.length) {
        return NONE
      }
      closeUnmatched()
      container.text = paragraphLines.slice(0, -1).map((text) => text + "\n").join("")
      const headerLine = container.line + paragraphLines.length - 1
      finalize(container)
      addChild("table", {
        line: headerLine,
        header,
        alignments: delimiters.map((cell) =>
          cell.startsWith(":") ? cell.endsWith(":") ? "Center" : "Left" : cell.endsWith(":") ? "Right" : "None"
        )
      })
      return LEAF_CONSUMED
    },
    () => {
      if (!indented || current().type === "paragraph" || blank) {
        return NONE
      }
      advanceOffset(4, true)
      closeUnmatched()
      addChild("code")
      return LEAF
    }
  ]
  const startsBlock = () => {
    const text = rest()
    return !indented &&
      (/^(?:>|#{1,6}(?:[ \t]|$)|`{3,}|~{3,}|[*+-](?:[ \t]|$)|\d{1,9}[.)](?:[ \t]|$))/.test(text) ||
        reThematicBreak.test(text) ||
        reDirective.test(text) ||
        reHtmlBlock.test(text))
  }

  for (const source of lines) {
    line = source
    lineNumber++
    offset = 0
    column = 0
    blank = false
    partialTab = false
    oldTip = current()
    let container = document
    let consumed = false
    for (let child = container.children.at(-1); child?.open; child = container.children.at(-1)) {
      findNextNonspace()
      const result = continues(child)
      if (result === CONSUMED) {
        consumed = true
      }
      if (result !== MATCHED) {
        break
      }
      container = child
    }
    if (consumed) {
      continue
    }
    allClosed = container === oldTip
    lastMatched = container
    let matchedLeaf = container.type !== "paragraph" && acceptsLines(container.type)
    while (!matchedLeaf) {
      findNextNonspace()
      let result = NONE
      for (const start of starts) {
        result = blank ? NONE : start(container)
        if (result !== NONE) {
          break
        }
      }
      if (result === NONE) {
        break
      }
      container = current()
      matchedLeaf = result >= LEAF
      consumed = result === LEAF_CONSUMED
    }
    if (consumed) {
      continue
    }
    if (!allClosed && !blank && current().type === "paragraph") {
      addLine()
    } else {
      closeUnmatched()
      if (acceptsLines(container.type)) {
        addLine()
      } else if (offset < line.length && !blank) {
        addChild("paragraph")
        advanceNextNonspace()
        addLine()
      }
    }
  }
  for (let open = tip; open !== undefined; open = tip) {
    finalize(open)
  }

  const literalLinks = new WeakSet<RawInline>()
  const withoutLiteralLinks = (nodes: ReadonlyArray<RawInline>): Array<RawInline> =>
    nodes.flatMap((node): Array<RawInline> =>
      !("content" in node)
        ? [node]
        : literalLinks.has(node)
        ? node.content
        : [{ ...node, content: withoutLiteralLinks(node.content) }]
    )

  const parseInlines = (subject: string, startLine: number): Array<RawInline> => {
    const nodes: Array<RawInline> = []
    let pos = 0
    let delimiters: Delimiter | null = null
    let brackets: Bracket | null = null
    let hardBreak = false
    const lineAt = (index: number) => startLine + subject.slice(0, index).split("\n").length - 1
    const safeUrl = (url: string, index: number): string => {
      if (!isAllowedUrl(url)) {
        const line = lineAt(index)
        problems.push({ line, column: index, message: unsupportedUrl(url, line) })
      }
      return url
    }
    const text = (value: string): RawText => {
      const node: RawText = { _tag: "Text", value }
      nodes.push(node)
      return node
    }
    const match = (pattern: RegExp) => {
      const result = pattern.exec(subject.slice(pos))
      if (result !== null) {
        pos += result[0].length
      }
      return result
    }
    const removeDelimiter = (delimiter: Delimiter) => {
      if (delimiter.previous !== null) {
        delimiter.previous.next = delimiter.next
      }
      if (delimiter.next === null) {
        delimiters = delimiter.previous
      } else {
        delimiter.next.previous = delimiter.previous
      }
    }

    const delimiterRun = (char: string) => {
      const start = pos
      while (subject[pos] === char) {
        pos++
      }
      const count = pos - start
      const previousCode = subject.charCodeAt(start - 1)
      const before = start === 0
        ? "\n"
        : previousCode >= 0xdc00 && previousCode <= 0xdfff
        ? subject.slice(start - 2, start)
        : subject[start - 1]
      const after = pos >= subject.length ? "\n" : String.fromCodePoint(subject.codePointAt(pos) ?? 0)
      const afterSpace = /^\s/.test(after)
      const beforeSpace = /^\s/.test(before)
      const afterPunctuation = rePunctuation.test(after)
      const beforePunctuation = rePunctuation.test(before)
      const left = !afterSpace && (!afterPunctuation || beforeSpace || beforePunctuation)
      const right = !beforeSpace && (!beforePunctuation || afterSpace || afterPunctuation)
      const node = text(subject.slice(start, pos))
      if (char === "~" && count > 2) {
        return
      }
      const delimiter: Delimiter = {
        char,
        count,
        original: count,
        node,
        previous: delimiters,
        next: null,
        canOpen: char === "_" ? left && (!right || beforePunctuation) : left,
        canClose: char === "_" ? right && (!left || afterPunctuation) : right
      }
      if (delimiter.previous !== null) {
        delimiter.previous.next = delimiter
      }
      delimiters = delimiter
    }

    const processEmphasis = (bottom: Delimiter | null) => {
      const openersBottom: Record<string, Delimiter | null> = {}
      let closer: Delimiter | null = delimiters
      while (closer !== null && closer.previous !== bottom) {
        closer = closer.previous
      }
      while (closer !== null) {
        if (!closer.canClose) {
          closer = closer.next
          continue
        }
        const key = closer.char + (closer.canOpen ? "o" : "c") + (closer.original % 3)
        const stop = Object.hasOwn(openersBottom, key) ? openersBottom[key] : bottom
        let opener = closer.previous
        let found = false
        for (; opener !== null && opener !== bottom && opener !== stop; opener = opener.previous) {
          const oddMatch = (closer.canOpen || opener.canClose) && closer.original % 3 !== 0 &&
            (opener.original + closer.original) % 3 === 0
          const sameLength = closer.char !== "~" || opener.count === closer.count
          if (opener.char === closer.char && opener.canOpen && !oddMatch && sameLength) {
            found = true
            break
          }
        }
        const currentCloser: Delimiter = closer
        if (found && opener !== null) {
          const used = closer.char === "~" ? closer.count : closer.count >= 2 && opener.count >= 2 ? 2 : 1
          opener.count -= used
          closer.count -= used
          opener.node.value = opener.node.value.slice(used)
          closer.node.value = closer.node.value.slice(used)
          const to = nodes.indexOf(closer.node)
          const from = nodes.lastIndexOf(opener.node, to)
          const content = nodes.splice(from + 1, to - from - 1)
          nodes.splice(from + 1, 0, {
            _tag: closer.char === "~" ? "Strikethrough" : used === 2 ? "Strong" : "Emphasis",
            content
          })
          while (closer.previous !== null && closer.previous !== opener) {
            removeDelimiter(closer.previous)
          }
          if (opener.count === 0) {
            removeDelimiter(opener)
          }
          if (closer.count === 0) {
            removeDelimiter(closer)
            closer = closer.next
          }
        } else {
          closer = closer.next
          openersBottom[key] = currentCloser.previous
          if (!currentCloser.canOpen) {
            removeDelimiter(currentCloser)
          }
        }
      }
      for (let top = delimiters; top !== null && top !== bottom; top = delimiters) {
        removeDelimiter(top)
      }
    }

    const spaces = () => match(/^[ \t]*(?:\n[ \t]*)?/)
    const linkDestination = (): string | null => {
      if (subject[pos] === "<") {
        const result = match(/^<((?:[^<>\n\\]|\\.)*)>/)
        return result === null ? null : unescape(result[1])
      }
      const start = pos
      let open = 0
      for (; pos < subject.length; pos++) {
        const char = subject[pos]
        if (char === "\\" && reEscapable.test(subject[pos + 1] ?? "")) {
          pos++
        } else if (char === "(") {
          open++
        } else if (char === ")") {
          if (open === 0) {
            break
          }
          open--
        } else if (char <= " ") {
          break
        }
      }
      return open !== 0 || (pos === start && subject[pos] !== ")") ? null : unescape(subject.slice(start, pos))
    }
    const linkTitle = (): string | null => {
      const result = match(/^(?:"((?:\\[\s\S]|[^"\\])*)"|'((?:\\[\s\S]|[^'\\])*)'|\(((?:\\[\s\S]|[^()\\])*)\))/)
      return result === null ? null : unescape(result[1] ?? result[2] ?? result[3])
    }
    const inlineLink = (): { readonly url: string; readonly title: string | null } | null => {
      const start = pos
      pos++
      spaces()
      const url = linkDestination()
      if (url !== null) {
        const beforeTitle = pos
        spaces()
        const title = pos > beforeTitle ? linkTitle() : null
        spaces()
        if (subject[pos] === ")") {
          pos++
          return { url, title }
        }
      }
      pos = start
      return null
    }

    const closeBracket = () => {
      pos++
      const opener = brackets
      if (opener === null) {
        text("]")
        return
      }
      brackets = opener.previous
      if (!opener.active) {
        text("]")
        return
      }
      const afterBracket = pos
      let target = subject[pos] === "(" ? inlineLink() : null
      if (target === null) {
        const label = match(/^\[(?:[^\\[\]]|\\[\s\S]){0,999}\]/)
        const reference = label !== null && label[0].length > 2
          ? label[0].slice(1, -1)
          : opener.bracketAfter
          ? null
          : subject.slice(opener.index + 1, afterBracket - 1)
        if (reference !== null && reference.startsWith("^") && footnotes.has(normalizeLabel(reference.slice(1)))) {
          report("footnoteReference", lineAt(opener.index), opener.index)
          target = { url: "", title: null }
        } else if (reference !== null && definitions.has(normalizeLabel(reference))) {
          report(opener.image ? "imageReference" : "linkReference", lineAt(opener.index), opener.index)
          target = { url: "", title: null }
        } else {
          pos = afterBracket
        }
      }
      if (target === null) {
        text("]")
        return
      }
      const from = nodes.lastIndexOf(opener.node)
      processEmphasis(opener.previousDelimiter)
      const content = nodes.splice(from + 1)
      nodes.pop()
      const url = safeUrl(target.url, opener.index)
      if (opener.image) {
        nodes.push({ _tag: "Image", url, alt: plainText(content), title: Option.fromNullOr(target.title) })
      } else {
        nodes.push({
          _tag: "Link",
          url,
          title: Option.fromNullOr(target.title),
          content: withoutLiteralLinks(content)
        })
        for (let bracket = brackets; bracket !== null; bracket = bracket.previous) {
          if (!bracket.image) {
            bracket.active = false
          }
        }
      }
    }
    const openBracket = (image: boolean) => {
      const index = image ? pos + 1 : pos
      pos = index + 1
      const node = text(image ? "![" : "[")
      if (brackets !== null) {
        brackets.bracketAfter = true
      }
      brackets = {
        node,
        previous: brackets,
        previousDelimiter: delimiters,
        index,
        image,
        active: true,
        bracketAfter: false
      }
    }

    const codeSpan = () => {
      const ticks = match(/^`+/)?.[0] ?? ""
      const closing = /`+/g
      closing.lastIndex = pos
      for (let found = closing.exec(subject); found !== null; found = closing.exec(subject)) {
        if (found[0].length !== ticks.length) {
          continue
        }
        const value = subject.slice(pos, found.index).replace(/\n/g, " ")
        const padded = /^ [\s\S]* $/.test(value) && /[^ ]/.test(value)
        nodes.push({ _tag: "InlineCode", value: padded ? value.slice(1, -1) : value })
        pos = closing.lastIndex
        return
      }
      text(ticks)
    }
    const angle = () => {
      const email = match(reEmailAutolink)
      if (email !== null) {
        nodes.push({
          _tag: "Link",
          url: "mailto:" + email[1],
          title: Option.none(),
          content: [{ _tag: "Text", value: email[1] }]
        })
        return
      }
      const start = pos
      const uri = match(reUriAutolink)
      if (uri !== null) {
        nodes.push({
          _tag: "Link",
          url: safeUrl(uri[1], start),
          title: Option.none(),
          content: [{ _tag: "Text", value: uri[1] }]
        })
        return
      }
      const html = match(reHtmlTag)
      if (html !== null) {
        report("html", lineAt(start), start)
        text(html[0])
        return
      }
      pos++
      text("<")
    }
    const literalAutolink = () => {
      const found = /^(https?:\/\/|www\.)((?:[^\s<\]]|\](?![([:\s]|$))*)/i.exec(subject.slice(pos))
      if (found === null) {
        return
      }
      const www = found[1].length === 4
      const before = subject[pos - 1]
      let opens = found[2].split("(").length - 1
      let closes = found[2].split(")").length - 1
      let end = found[2].length
      while (end > 0) {
        const char = found[2][end - 1]
        if (char === ")" && closes > opens) {
          closes--
          end--
        } else if (char === ";") {
          end = /&[A-Za-z0-9]+;$/.exec(found[2].slice(0, end))?.index ?? end - 1
        } else if (char !== ")" && `!"&',.:<>?]*_~`.includes(char)) {
          end--
        } else {
          break
        }
      }
      const body = found[2].slice(0, end)
      const domain = (/^(?:[^\s\p{P}\p{S}]|[-._])*/u.exec(body)?.[0] ?? "").split(".")
      const validDomain = domain[0] !== "" &&
        (www ? ["www", ...domain] : domain).slice(-2).every((part) => !part.includes("_")) &&
        (before === undefined || (www ? reSpaceOrPunctuation.test(before) : !/[A-Za-z]/.test(before)))
      if (!validDomain || body === "") {
        pos += found[1].length
        text(found[1])
        return
      }
      pos += found[1].length + body.length
      const link: RawInline = {
        _tag: "Link",
        url: (www ? "http://" : "") + found[1] + body,
        title: Option.none(),
        content: [{ _tag: "Text", value: found[1] + body }]
      }
      nodes.push(link)
      literalLinks.add(link)
    }
    const string = () => {
      const chunk = /^[^\n\\`*_~[\]!<&:]+/.exec(subject.slice(pos))?.[0] ?? ""
      const link = subject.slice(pos, pos + chunk.length + 3).search(/https?:\/\/|www\./i)
      if (link === 0) {
        literalAutolink()
        return
      }
      let value = link > 0 ? chunk.slice(0, link) : chunk
      pos += value.length
      if (subject[pos] === "\n") {
        hardBreak = / {2,}$/.test(value)
        value = value.replace(/[ \t]+$/, "")
      }
      text(value)
    }

    while (pos < subject.length) {
      const char = subject[pos]
      if (char === "\n") {
        pos++
        if (hardBreak) {
          nodes.push({ _tag: "HardBreak" })
        } else {
          text("\n")
        }
        hardBreak = false
        match(/^[ \t]*/)
      } else if (char === "\\") {
        pos++
        if (subject[pos] === "\n") {
          pos++
          nodes.push({ _tag: "HardBreak" })
          match(/^[ \t]*/)
        } else if (reEscapable.test(subject[pos] ?? "")) {
          text(subject[pos++])
        } else {
          text("\\")
        }
      } else if (char === "`") {
        codeSpan()
      } else if (char === "*" || char === "_" || char === "~") {
        delimiterRun(char)
      } else if (char === "[") {
        openBracket(false)
      } else if (char === "!" && subject[pos + 1] === "[") {
        openBracket(true)
      } else if (char === "]") {
        closeBracket()
      } else if (char === "<") {
        angle()
      } else if (char === "&") {
        const entity = match(reEntityHere)
        if (entity === null) {
          pos++
        }
        text(entity === null ? "&" : decodeEntity(entity[0]))
      } else if (char === ":" || char === "!") {
        const after = subject.slice(pos)
        const lineStart = pos === 0 || subject[pos - 1] === "\n"
        if (
          char === ":" && subject[pos - 1] !== ":" &&
          (reTextDirective.test(after) || (lineStart && reLoneTextDirective.test(after)))
        ) {
          report("textDirective", lineAt(pos), pos)
        }
        pos++
        text(char)
      } else {
        string()
      }
    }
    processEmphasis(null)
    return tidy(nodes).flatMap(emails)
  }

  const content = (block: BlockNode) => {
    const leading = /^[ \t\n]*/.exec(block.text)?.[0] ?? ""
    return parseInlines(
      block.text.slice(leading.length).replace(/[ \t\n]+$/, ""),
      block.line + leading.split("\n").length - 1
    )
  }
  const row = (cells: ReadonlyArray<string>, line: number): Markdown.TableRow => ({
    _tag: "TableRow",
    cells: cells.map((cell) => ({ _tag: "TableCell", content: parseInlines(cell, line) }))
  })
  const toListItem = (item: BlockNode): Markdown.ListItem => {
    const first = item.children[0]
    if (first?.type === "paragraph" && /^\[[ \txX]\][ \t\n]+\S/.test(first.text)) {
      report("task list item", item.line)
    }
    return { _tag: "ListItem", blocks: item.children.map(toBlock) }
  }
  const toBlock = (block: BlockNode): Markdown.Block => {
    switch (block.type) {
      case "heading":
        return { _tag: "Heading", level: block.level, content: content(block) }
      case "thematicBreak":
        return { _tag: "ThematicBreak" }
      case "blockquote":
        return { _tag: "Blockquote", blocks: block.children.map(toBlock) }
      case "code": {
        const info = /^(\S*)\s*([\s\S]*)$/.exec(block.info)
        const language = info?.[1] ?? ""
        const meta = info?.[2] ?? ""
        return {
          _tag: "CodeBlock",
          language: nonEmpty(language),
          meta: nonEmpty(meta),
          value: block.text.replace(/\n$/, "")
        }
      }
      case "list": {
        const [first, ...others] = block.children.map(toListItem)
        return {
          _tag: "List",
          isOrdered: block.ordered,
          startNumber: Option.fromNullOr(block.start),
          items: [first, ...others]
        }
      }
      case "table":
        return {
          _tag: "Table",
          alignments: block.alignments,
          headerRow: row(block.header, block.line),
          bodyRows: block.text.split("\n").slice(0, -1).map((text, index) =>
            row(splitRow(text), block.line + 2 + index)
          )
        }
      case "directive": {
        if (block.leaf && block.label !== undefined) {
          report("leaf directive label", block.line)
        }
        const problem = options.island?.(block.name, block.attributes, block.line)
        if (problem !== undefined) {
          problems.push({ line: block.line, column: 0, message: problem })
        }
        const label: Array<Markdown.Block> = block.label === undefined
          ? []
          : [{ _tag: "Paragraph", content: parseInlines(block.label, block.line) }]
        return {
          _tag: "Island",
          name: block.name,
          attributes: block.attributes,
          blocks: [...label, ...block.children.map(toBlock)]
        }
      }
      default:
        return { _tag: "Paragraph", content: content(block) }
    }
  }
  const blocks = document.children.map(toBlock)
  const [problem, ...others] = problems
  if (problem === undefined) {
    return Result.succeed({ blocks })
  }
  return Result.fail(
    others.reduce(
      (first, next) =>
        next.line < first.line || (next.line === first.line && next.column < first.column) ? next : first,
      problem
    )
  )
}
