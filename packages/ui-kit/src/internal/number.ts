import { clamp } from "./range.ts"

export type Locale = string | ReadonlyArray<string> | undefined

export type Format = Intl.NumberFormatOptions & {
  readonly roundingIncrement?: number | undefined
  readonly roundingMode?: string | undefined
  readonly roundingPriority?: string | undefined
  readonly trailingZeroDisplay?: string | undefined
}

const formatters = new Map<string, Intl.NumberFormat>()

export const formatterOf = (locale: Locale, format?: Format): Intl.NumberFormat => {
  const key = JSON.stringify({ locale, format })
  let formatter = formatters.get(key)
  if (formatter === undefined) {
    formatter = new Intl.NumberFormat(locale as string | Array<string> | undefined, format)
    formatters.set(key, formatter)
  }
  return formatter
}

export const formatNumber = (value: number | null, locale: Locale, format?: Format): string =>
  value === null ? "" : formatterOf(locale, format).format(value)

const hanNumerals = "零〇一二三四五六七八九"
const nonAsciiDigit = /[٠-٩۰-۹０-９]/
const anyNumeral = /[0-9٠-٩۰-۹０-９零〇一二三四五六七八九]/
const arabicOrPersian = /[٠-٩۰-۹]/
const han = /[零〇一二三四五六七八九]/
const percent = /[%٪％﹪]/
const permille = /[‰؉]/
const percentSigns = ["%", "٪", "％", "﹪"]
const permilleSigns = ["‰", "؉"]
const baseSymbols = [".", ",", "．", "，", "٫", "٬"]
const plusSigns = ["+", "＋", "﹢"]
const minusSigns = ["-", "−", "－", "‒", "–", "—", "﹣"]
const spaceSeparator = /\p{Zs}/u
const formatControl = /\p{Cf}/u
const formatControls = /\p{Cf}/gu
const anyMinus = /[-−－‒–—﹣]/
const anyPlus = /[+＋﹢]/
const anySign = /[-−－‒–—﹣+＋﹢]/
const minuses = /[-−－‒–—﹣]/gu
const pluses = /[+＋﹢]/gu

export const isNumeral = (character: string): boolean => anyNumeral.test(character)

// Some locales group from six digits and compact notation abbreviates seven,
// so both sizes are needed to see every separator.
const sampleNumbers = [1111111.1, 11111.1]

const pluralNumbers = [0, 1, 2, 3, 5, 6, 7, 11, 21, 100, 0.02, 1.01, 1.5, 1.49, 1e6]

const partsCache = new Map<string, ReadonlyArray<Intl.NumberFormatPart>>()

const partsOf = (all: boolean, locale: Locale, format?: Format): ReadonlyArray<Intl.NumberFormatPart> => {
  const key = JSON.stringify({ all, locale, format })
  let parts = partsCache.get(key)
  if (parts === undefined) {
    const formatter = formatterOf(locale, format)
    parts = (all ? [...sampleNumbers, ...pluralNumbers] : sampleNumbers).flatMap((value) =>
      formatter.formatToParts(value)
    )
    partsCache.set(key, parts)
  }
  return parts
}

const decimalOf = (locale: Locale, numberingSystem?: string): string =>
  formatterOf(locale, { numberingSystem, useGrouping: false })
    .formatToParts(0.1)
    .find((part) => part.type === "decimal")?.value ?? "."

export interface LocaleDetails {
  readonly decimal: string
  readonly group?: string | undefined
  readonly currency?: string | undefined
  readonly percentSign?: string | undefined
  readonly exponentSeparator?: string | undefined
}

export const localeDetails = (locale: Locale, format?: Format): LocaleDetails => {
  const details: Record<string, string> = {}
  for (const part of partsOf(false, locale, format)) details[part.type] = part.value
  return { ...details, decimal: decimalOf(locale, format?.numberingSystem) }
}

const digitsOf = (locale: Locale, format?: Format): ReadonlyArray<string> =>
  Array.from(
    formatterOf(locale, { numberingSystem: format?.numberingSystem, useGrouping: false }).format(9876543210)
  ).reverse()

const shiftDecimal = (value: number, by: number): number => {
  const [coefficient, exponent = "0"] = String(value).split("e")
  return Number(coefficient + "e" + (Number(exponent) + by))
}

export const parseNumber = (text: string, locale: Locale, format?: Format): number | null => {
  let input = text.replace(formatControls, "").trim()
  let from = locale
  if (from === undefined) {
    if (arabicOrPersian.test(input)) from = "ar"
    else if (han.test(input)) from = "zh"
  }
  const { decimal, exponentSeparator, group } = localeDetails(from, format)
  const digits = digitsOf(from, format)
  input = input.replace(minuses, "-").replace(pluses, "+")
  let negative = false
  const takeSign = (_match: string, sign: string): string => {
    if (sign !== "+") negative = true
    return ""
  }
  input = input.replace(/^\s*([+-])/, takeSign)
  // The formatter's own labels go first, while they still match, so a dot
  // inside one isn't read as a separator.
  const labels = partsOf(true, from, format)
    .filter((part) => part.type === "currency" || part.type === "unit")
    .map((part) => part.value.replace(formatControls, ""))
    .sort((a, b) => b.length - a.length)
  for (const label of labels) input = input.replaceAll(label, "")
  const toAscii = (value: string): string =>
    value.replace(/[\p{Nd}零〇一二三四五六七八九]/gu, (character) => {
      const localeDigit = digits.indexOf(character)
      if (localeDigit !== -1) return String(localeDigit)
      const hanDigit = hanNumerals.indexOf(character)
      // Both zeros come first, so the digit is one less than the index.
      if (hanDigit !== -1) return String(Math.max(hanDigit - 1, 0))
      // The bases of these digit ranges are multiples of 16.
      return nonAsciiDigit.test(character) ? String(character.charCodeAt(0) % 16) : character
    })
  input = toAscii(input)
  if (exponentSeparator !== undefined && exponentSeparator !== "") {
    input = input.replaceAll(toAscii(exponentSeparator), "e")
  }
  input = input.replace(/(?<![\p{L}\p{M}])([+-])\s*$/u, takeSign)
  if (format?.currencySign === "accounting") input = input.replace(/^\s*(\()/, takeSign)
  if (group !== undefined && group !== "") {
    input = input.replaceAll(spaceSeparator.test(group) ? /\p{Zs}/gu : /['’]/.test(group) ? /['’]/g : group, "")
  }
  input = input.replace(/\.(?![，٬%٪％﹪‰؉]*\d)/g, "")
  const plain = input
    .replaceAll(decimal, ".")
    .replaceAll(decimalOf(from), ".")
    .replace(/[．٫]/g, ".")
    .replace(/[，٬%٪％﹪‰؉]/g, "")
    .trim()
    .replace(/\.(?=[^.]*\.)/g, "")
  if (/^[-+]?Infinity$/i.test(input) || input.includes("∞")) return null
  let parsed = parseFloat((negative ? "-" : "") + plain)
  if (permille.test(input)) parsed = shiftDecimal(parsed, -3)
  else if (
    !(format?.style === "unit" && format.unit === "percent") && (percent.test(input) || format?.style === "percent")
  ) {
    parsed = shiftDecimal(parsed, -2)
  }
  return Number.isFinite(parsed) ? parsed : null
}

export interface Typing {
  readonly allowed: string
  readonly single: ReadonlyArray<string>
}

const typingCache = new Map<string, Typing>()

export const typingOf = (locale: Locale, format: Format | undefined, negative: boolean): Typing => {
  const key = JSON.stringify({ locale, format, negative })
  const cached = typingCache.get(key)
  if (cached !== undefined) return cached
  const parts = partsOf(true, locale, format)
  const details = localeDetails(locale, format)
  const allowed = new Set<string>(baseSymbols)
  const add = (characters: Iterable<string>) => {
    for (const character of characters) allowed.add(character)
  }
  allowed.add(parts.find((part) => part.type === "decimal")?.value ?? details.decimal)
  for (const part of parts) {
    if (["integer", "fraction", "exponentInteger", "compact"].includes(part.type)) continue
    add(Array.from(part.value))
    if (spaceSeparator.test(part.value)) allowed.add(" ")
  }
  add(digitsOf(locale, format))
  const style = format?.style
  if (style === "percent" || (style === "unit" && format?.unit === "percent")) add(percentSigns)
  if (style === "percent" || (style === "unit" && format?.unit === "permille")) add(permilleSigns)
  add(plusSigns)
  if (negative) {
    add(minusSigns)
    if (format?.currencySign === "accounting") add(["(", ")"])
  }
  const typing = {
    allowed: Array.from(allowed).join(""),
    single: [details.decimal, details.currency, details.percentSign].filter((symbol) => symbol !== undefined)
  }
  typingCache.set(key, typing)
  return typing
}

const allowsCharacter = (character: string, typing: Pick<Typing, "allowed">): boolean =>
  isNumeral(character) || anyMinus.test(character) || typing.allowed.includes(character) ||
  formatControl.test(character)

export const allowsText = (text: string, typing: Pick<Typing, "allowed">): boolean =>
  Array.from(text).every((character) => allowsCharacter(character, typing))

export const allowedIn = (text: string, typing: Pick<Typing, "allowed">): string =>
  Array.from(text).filter((character) => allowsCharacter(character, typing)).join("")

const navigationKeys = new Set(["Backspace", "Delete", "ArrowLeft", "ArrowRight", "Tab", "Enter", "Escape"])

export interface Keystroke {
  readonly key: string
  readonly text: string
  readonly start: number | null
  readonly end: number | null
  readonly modified: boolean
}

export const allowsKey = ({ end, key, modified, start, text }: Keystroke, typing: Typing): boolean => {
  if (modified || navigationKeys.has(key) || isNumeral(key)) return true
  const all = start === 0 && end === text.length
  const selects = (index: number): boolean => start !== null && end !== null && index >= start && index < end
  let allowed = Array.from(typing.allowed).includes(key)
  for (const detect of [anyMinus, anyPlus]) {
    if (detect.test(key) && Array.from(typing.allowed).some((character) => detect.test(character))) {
      const at = text.search(anySign)
      allowed = at === -1 || all || selects(at)
    }
  }
  for (const symbol of typing.single) {
    if (key === symbol) {
      const at = text.indexOf(symbol)
      allowed = at === -1 || all || selects(at)
    }
  }
  return allowed || key.length > 1
}

const hasRounding = (format?: Format): format is Format =>
  format?.maximumFractionDigits != null ||
  format?.minimumFractionDigits != null ||
  format?.maximumSignificantDigits != null ||
  format?.minimumSignificantDigits != null ||
  format?.roundingIncrement != null ||
  format?.roundingMode != null ||
  format?.roundingPriority != null

export const rounded = (value: number, format?: Format): number =>
  hasRounding(format) ? withoutFloatingPointErrors(value, format) : value

const withoutFloatingPointErrors = (value: number, format?: Format): number => {
  if (!Number.isFinite(value)) return value
  if (!hasRounding(format)) {
    const precise = parseFloat(value.toPrecision(15))
    // Capped, so large values keep their real fraction digits.
    return Math.abs(precise - value) <= Math.min(Number.EPSILON * Math.max(1, Math.abs(value)), 1e-10)
      ? precise
      : value
  }
  const formatter = formatterOf("en-US", {
    ...format,
    signDisplay: "auto",
    currencySign: "standard",
    notation: format.notation === "compact" ? "standard" : format.notation,
    useGrouping: false
  })
  const text = formatter.format(value)
  const parsed = parseNumber(text, "en-US", format)
  return parsed !== null && formatter.format(parsed) === text ? parsed : value
}

const snapped = (value: number, base: number, step: number, nearest: boolean): number => {
  const size = Math.abs(step)
  const direction = Math.sign(step)
  const steps = value - base + size * 1e-10 * direction
  if (nearest) return base + Math.round(steps / step) * step
  return base + (direction > 0 ? Math.floor(steps / size) : Math.ceil(steps / size)) * size
}

export interface Range {
  readonly min: number | undefined
  readonly max: number | undefined
  readonly format: Format | undefined
  readonly snapOnStep: boolean
}

export const lowest = (range: Range): number => range.min ?? Number.MIN_SAFE_INTEGER
export const highest = (range: Range): number => range.max ?? Number.MAX_SAFE_INTEGER

export const validated = (
  value: number,
  range: Range,
  options: { readonly step?: number | undefined; readonly small?: boolean; readonly clamp: boolean }
): number => {
  const { step } = options
  const min = lowest(range)
  const max = highest(range)
  let next = value
  if (step !== undefined && step !== 0 && range.snapOnStep) {
    next = snapped(next, range.min ?? 0, step, options.small === true)
  }
  // Clamped before rounding and again after it, as rounding can push a value
  // back out of a fractional bound.
  if (options.clamp) next = clamp(next, min, max)
  if (step === undefined && !hasRounding(range.format)) return next
  const clean = withoutFloatingPointErrors(next, range.format)
  return options.clamp ? clamp(clean, min, max) : clean
}
