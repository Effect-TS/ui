export interface TextFilter {
  readonly contains: (text: string, query: string) => boolean
  readonly startsWith: (text: string, query: string) => boolean
  readonly endsWith: (text: string, query: string) => boolean
}

type Locale = string | ReadonlyArray<string> | undefined

const defaults: Intl.CollatorOptions = {
  usage: "search",
  sensitivity: "base",
  ignorePunctuation: true
}

const cache = new Map<string, TextFilter>()

const uneven = /[^\p{L}\p{N}]|\P{ASCII}/u

const marked = /\p{M}/u

const cluster = /\P{M}\p{M}*|\p{M}+/gu

type Where = (
  at: (from: number) => boolean,
  text: number,
  query: number
) => boolean

const anywhere: Where = (at, text, query) => {
  for (let i = 0; i <= text - query; i++) {
    if (at(i)) return true
  }
  return false
}

const atStart: Where = (at) => at(0)

const atEnd: Where = (at, text, query) => text >= query && at(text - query)

const make = (locale: Locale, options: Intl.CollatorOptions): TextFilter => {
  const collator = new Intl.Collator(
    locale as Array<string> | string | undefined,
    options
  )
  const same = (a: string, b: string) => collator.compare(a, b) === 0
  // Ignored punctuation and marks make a match's length differ from the
  // query's, so such text is compared again by cluster: a letter with its
  // marks, as in Swedish "ö" is a different letter from "o".
  const ignored = new Map<string, boolean>()
  const clusters = (text: string): Array<string> =>
    (text.match(cluster) ?? []).filter((part) => {
      let skip = ignored.get(part)
      if (skip === undefined) {
        ignored.set(part, skip = collator.compare(part, "") === 0)
      }
      return !skip
    })
  // Composed, so either Unicode form matches the same. A plain slice could
  // split a letter from its mark, so it only runs on text without marks.
  const match = (where: Where) => (text: string, query: string): boolean => {
    if (query === "") return true
    const composed = text.normalize("NFC")
    const composedQuery = query.normalize("NFC")
    if (
      !marked.test(composed) &&
      where(
        (from) =>
          same(
            composed.slice(from, from + composedQuery.length),
            composedQuery
          ),
        composed.length,
        composedQuery.length
      )
    ) return true
    if (!uneven.test(composed) && !uneven.test(composedQuery)) return false
    const parts = clusters(composedQuery)
    if (parts.length === 0) return false
    const all = clusters(composed)
    const joined = parts.join("")
    return where(
      (from) => same(all.slice(from, from + parts.length).join(""), joined),
      all.length,
      parts.length
    )
  }
  return {
    contains: match(anywhere),
    startsWith: match(atStart),
    endsWith: match(atEnd)
  }
}

export const textFilter = (
  locale?: Locale,
  options?: Intl.CollatorOptions
): TextFilter => {
  const key = options === undefined
    ? String(locale)
    : JSON.stringify([locale ?? null, options])
  let filter = cache.get(key)
  if (filter === undefined) {
    cache.set(key, filter = make(locale, { ...defaults, ...options }))
  }
  return filter
}
