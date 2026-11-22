export const isHTMLElement = (node: unknown): node is HTMLElement => {
  const view = (node as Node | null)?.ownerDocument?.defaultView
  return view != null && node instanceof view.HTMLElement
}

export const activeOf = (document: Document): Element | null => {
  let active = document.activeElement
  while (active?.shadowRoot?.activeElement != null) active = active.shadowRoot.activeElement
  return active
}

export const radioGroup = (element: HTMLElement): Array<HTMLInputElement> => {
  const radio = element as HTMLInputElement
  if (radio.localName !== "input" || radio.type !== "radio" || radio.name === "") return []
  return Array.from((radio.form ?? radio.ownerDocument).querySelectorAll<HTMLInputElement>("input[type=\"radio\"]"))
    .filter((other) => other.name === radio.name && other.form === radio.form)
}

export const onRange = (event: Event): boolean =>
  event.composedPath().some((target) =>
    isHTMLElement(target) && target.localName === "input" && (target as HTMLInputElement).type === "range"
  )

export const byAttribute = (document: Document, name: string, value: string): HTMLElement | null =>
  document.querySelector<HTMLElement>("[" + name + "=\"" + CSS.escape(value) + "\"]")

export const focusFinal = (
  document: Document,
  popupId: string,
  fallback: HTMLElement | null,
  lost: boolean,
  keyboard: boolean
): void => {
  const marked = byAttribute(document, "data-final-focus", popupId)
  const back = marked ?? fallback
  if (back !== null && (marked !== null || lost)) {
    back.focus({ preventScroll: true, focusVisible: keyboard } as FocusOptions)
  }
}

type StyleName = Exclude<
  { [K in keyof CSSStyleDeclaration]: CSSStyleDeclaration[K] extends string ? K : never }[keyof CSSStyleDeclaration],
  number
>

export const saved = (element: HTMLElement, names: ReadonlyArray<StyleName>): () => void => {
  const values = names.map((name) => element.style[name])
  return () => names.forEach((name, i) => (element.style[name] = values[i]!))
}
