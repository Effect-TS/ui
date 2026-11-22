export interface TextFilter {
  readonly contains: (text: string, query: string) => boolean
  readonly startsWith: (text: string, query: string) => boolean
  readonly endsWith: (text: string, query: string) => boolean
}

const cache = new Map<string, TextFilter>()

export const textFilter = (
  locale?: string | ReadonlyArray<string> | undefined,
  options?: Intl.CollatorOptions
): TextFilter => {
  const collatorOptions: Intl.CollatorOptions = {
    usage: "search",
    sensitivity: "base",
    ignorePunctuation: true,
    ...options
  }
  const key = JSON.stringify([locale ?? null, collatorOptions])
  const cached = cache.get(key)
  if (cached !== undefined) return cached
  const collator = new Intl.Collator(locale as Array<string> | string | undefined, collatorOptions)
  const same = (a: string, b: string) => collator.compare(a, b) === 0
  const filter: TextFilter = {
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
  cache.set(key, filter)
  return filter
}
