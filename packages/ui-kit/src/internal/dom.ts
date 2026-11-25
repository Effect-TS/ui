export const isElement = (node: unknown): node is Element =>
  (node as Node | null)?.nodeType === 1

export const isHTMLElement = (node: unknown): node is HTMLElement => {
  const ctor = (node as Node | null)?.ownerDocument?.defaultView?.HTMLElement ??
    globalThis.HTMLElement
  return ctor !== undefined && node instanceof ctor
}

export const perDocument = <A>(make: () => A): (document: Document) => A => {
  const made = new WeakMap<Document, A>()
  return (document) => {
    let value = made.get(document)
    if (value === undefined) made.set(document, value = make())
    return value
  }
}

export const focusVisible = (element: Element): boolean => {
  try {
    return element.matches(":focus-visible")
  } catch {
    return true
  }
}

export const activeOf = (
  root: Document | ShadowRoot
): Element | null => {
  let active = root.activeElement
  while (active?.shadowRoot?.activeElement != null) {
    active = active.shadowRoot.activeElement
  }
  return active
}

export const radioGroup = (element: HTMLElement): Array<HTMLInputElement> => {
  const radio = element as HTMLInputElement
  if (
    radio.localName !== "input" || radio.type !== "radio" || radio.name === ""
  ) return []
  // The whole tree: a form's radios can sit outside it and name it with `form`.
  return Array.from(
    (radio.getRootNode() as ParentNode).querySelectorAll<HTMLInputElement>(
      "input[type=\"radio\"]"
    )
  )
    .filter((other) => other.name === radio.name && other.form === radio.form)
}

export const onRange = (event: Event): boolean =>
  event.composedPath().some((target) =>
    isHTMLElement(target) && target.localName === "input" &&
    (target as HTMLInputElement).type === "range"
  )

export const byAttribute = (
  document: Document,
  name: string,
  value: string
): HTMLElement | null =>
  document.querySelector<HTMLElement>(
    "[" + name + "=\"" + CSS.escape(value) + "\"]"
  )

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
    back.focus({
      preventScroll: true,
      focusVisible: keyboard ? true : undefined
    } as FocusOptions)
  }
}

type StyleName = Exclude<
  {
    [K in keyof CSSStyleDeclaration]: CSSStyleDeclaration[K] extends string ? K
      : never
  }[keyof CSSStyleDeclaration],
  number
>

export const saved = (
  element: HTMLElement,
  names: ReadonlyArray<StyleName>
): () => void => {
  const values = names.map((name) => element.style[name])
  return () => names.forEach((name, i) => (element.style[name] = values[i]!))
}

export const override = (
  element: HTMLElement,
  styles: Readonly<Record<string, string>>,
  priority = ""
): () => void => {
  const style = element.style
  const before = Object.keys(styles).map((name) =>
    [
      name,
      style.getPropertyValue(name),
      style.getPropertyPriority(name)
    ] as const
  )
  for (const [name, value] of Object.entries(styles)) {
    style.setProperty(name, value, priority)
  }
  return () => {
    for (const [name, value, priority] of before) {
      if (value === "") style.removeProperty(name)
      else style.setProperty(name, value, priority)
    }
  }
}
