export interface TextFilter {
  readonly contains: (text: string, query: string) => boolean
  readonly startsWith: (text: string, query: string) => boolean
  readonly endsWith: (text: string, query: string) => boolean
}

type Locale = string | ReadonlyArray<string> | undefined

const defaults: Intl.CollatorOptions = { usage: "search", sensitivity: "base", ignorePunctuation: true }

const cache = new Map<string, TextFilter>()

const make = (locale: Locale, options: Intl.CollatorOptions): TextFilter => {
  const collator = new Intl.Collator(locale as Array<string> | string | undefined, options)
  const same = (a: string, b: string) => collator.compare(a, b) === 0
  return {
    contains: (text, query) => {
      if (query === "") return true
      for (let i = 0; i <= text.length - query.length; i++) {
        if (same(text.slice(i, i + query.length), query)) return true
      }
      return false
    },
    startsWith: (text, query) => query === "" || same(text.slice(0, query.length), query),
    endsWith: (text, query) =>
      query === "" || (text.length >= query.length && same(text.slice(text.length - query.length), query))
  }
}

export const textFilter = (locale?: Locale, options?: Intl.CollatorOptions): TextFilter => {
  const key = options === undefined ? String(locale) : JSON.stringify([locale ?? null, options])
  let filter = cache.get(key)
  if (filter === undefined) cache.set(key, filter = make(locale, { ...defaults, ...options }))
  return filter
}
