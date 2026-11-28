export const isElement = (node: unknown): node is Element =>
  (node as Node | null)?.nodeType === 1

export const rootOf = (node: Element): Document | ShadowRoot =>
  node.isConnected
    ? node.getRootNode() as Document | ShadowRoot
    : node.ownerDocument

// In a shadow root, focus outside it leaves its `activeElement` null.
export const focusedOf = (node: Element): Element | null =>
  rootOf(node).activeElement ?? node.ownerDocument.activeElement

// Listens in `node`'s tree and every tree above it, since outside a shadow
// root its events target the host. Each dispatch reaches `handler` once,
// with the target seen by the innermost tree.
export const listenTrees = <K extends keyof DocumentEventMap>(
  node: Element,
  type: K,
  handler: (event: DocumentEventMap[K]) => void,
  options: AddEventListenerOptions
): void => {
  const first = rootOf(node)
  if (first.nodeType === 9) {
    first.addEventListener(type, handler as EventListener, options)
    return
  }
  const roots: Array<Document | ShadowRoot> = []
  for (let root = first;; root = rootOf((root as ShadowRoot).host)) {
    roots.push(root)
    if (root.nodeType === 9) break
  }
  const capture = options.capture === true
  // Bubbling runs inside out, so the first tree to handle an event marks it
  // for the trees above to skip. Document capture starts each dispatch and
  // clears only that event's mark: a redispatch is handled again, while a
  // nested dispatch keeps the outer event's mark.
  const handled = new WeakSet<Event>()
  if (!capture) {
    roots[roots.length - 1]!.addEventListener(type, (event) => {
      handled.delete(event)
    }, { ...options, capture: true })
  }
  roots.forEach((root, i) => {
    const below = roots[i - 1] as ShadowRoot | undefined
    const above = new Set<Node>(roots.slice(i + 1))
    root.addEventListener(type, (event) => {
      const target = event.target as Node
      const targetRoot = target.getRootNode()
      // A slotted target is handled by the outer tree it belongs to.
      if (above.has(targetRoot)) return
      if (
        capture
          // Capture runs outside in, so leave events to the tree below. A
          // closed root is missing from the path, so its host stands in.
          ? below !== undefined && (target === below.host
            ? below.mode === "closed" || event.composedPath().includes(below)
            // happy-dom doesn't retarget.
            : targetRoot !== root && event.composedPath().includes(below))
          : handled.has(event)
      ) return
      if (event.composed) handled.add(event)
      handler(event as DocumentEventMap[K])
    }, options)
  })
}

export const isHTMLElement = (node: unknown): node is HTMLElement => {
  const ctor = (node as Node | null)?.ownerDocument?.defaultView?.HTMLElement ??
    globalThis.HTMLElement
  return ctor !== undefined && node instanceof ctor
}

// The element an event's target is, or the element a text node is in.
export const elementOf = (target: EventTarget | null): Element | null =>
  isElement(target) ? target : (target as Node | null)?.parentElement ?? null

export const perDocument = <A>(
  make: (document: Document) => A
): (document: Document) => A => {
  const made = new WeakMap<Document, A>()
  return (document) => {
    let value = made.get(document)
    if (value === undefined) made.set(document, value = make(document))
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

const tabbableSelector = [
  "a[href]",
  "area[href]",
  "button",
  "input:not([type=\"hidden\"])",
  "select",
  "textarea",
  "iframe",
  "summary",
  "details",
  "audio[controls]",
  "video[controls]",
  "[tabindex]",
  "[contenteditable]"
].join(",")

// An unchecked radio Tab skips: one in a named group that has a checked
// radio, or that isn't the group's first.
const radioOut = (element: HTMLElement): boolean => {
  const radio = element as HTMLInputElement
  if (
    radio.localName !== "input" || radio.type !== "radio" ||
    radio.name === "" || radio.checked
  ) {
    return false
  }
  const group = radioGroup(radio)
  return group.some((other) => other.checked) || group[0] !== radio
}

// Chromium reports layout boxes for content hidden by closed `<details>`,
// even though Tab skips that content.
const collapsed = "details:not([open]) > :not(summary:first-of-type)"

export const focusable = (element: HTMLElement): boolean =>
  element.isConnected && element.getClientRects().length > 0 &&
  element.closest(collapsed) === null &&
  !element.matches(":disabled") && element.closest("[inert]") === null &&
  element.ownerDocument.defaultView?.getComputedStyle(element).visibility !==
    "hidden"

// Chromium reports `tabIndex` -1 for an editing host and for a `<details>`
// without a summary, but Tab still stops on both.
const tabOrder = (element: HTMLElement): number => {
  if (element.hasAttribute("tabindex")) return element.tabIndex
  const host = element.localName === "details"
    ? element.querySelector(":scope > summary") === null
    : element.isContentEditable &&
      !(element.parentElement?.isContentEditable ?? false)
  return host ? 0 : element.tabIndex
}

const tabbable = (element: HTMLElement): boolean =>
  tabOrder(element) >= 0 && focusable(element) && !radioOut(element)

export const tabbablesIn = (root: Element): Array<HTMLElement> =>
  Array.from(root.querySelectorAll<HTMLElement>(tabbableSelector))
    .filter(tabbable)

// The Tab stops in `root`, in Tab order: positive `tabindex` first.
export const tabStopsIn = (root: Element): Array<HTMLElement> => {
  const found = tabbablesIn(root)
  return [
    ...found.filter((element) => tabOrder(element) > 0)
      .sort((a, b) => tabOrder(a) - tabOrder(b)),
    ...found.filter((element) => tabOrder(element) === 0)
  ]
}

// Moves focus itself, as the browser's next stop after a positive
// `tabindex` can be outside `root`.
export const trapTab = (event: KeyboardEvent, root: HTMLElement): void => {
  event.preventDefault()
  const items = tabStopsIn(root)
  if (items.length === 0) return
  const focused = activeOf(root.ownerDocument)
  const at = items.findIndex((element) => element === focused)
  const step = event.shiftKey ? -1 : 1
  let next: number
  if (at !== -1) next = at + step
  else if (focused === null || focused === root || !root.contains(focused)) {
    next = event.shiftKey ? -1 : 0
  } else {
    // Focus is on a non-stop inside `root`, such as the list.
    const after = items.findIndex((element) =>
      (focused.compareDocumentPosition(element) &
        Node.DOCUMENT_POSITION_FOLLOWING) !== 0
    )
    next = after === -1
      ? (event.shiftKey ? -1 : 0)
      : event.shiftKey
      ? after - 1
      : after
  }
  items.at(next % items.length)?.focus({ preventScroll: true })
}

export const byAttribute = (
  root: Document | ShadowRoot,
  name: string,
  value: string
): HTMLElement | null =>
  root.querySelector<HTMLElement>(
    "[" + name + "=\"" + CSS.escape(value) + "\"]"
  )

export const focusFinal = (
  root: Document | ShadowRoot,
  popupId: string,
  fallback: HTMLElement | null,
  lost: boolean,
  keyboard: boolean
): void => {
  const marked = byAttribute(root, "data-final-focus", popupId)
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

export const followPointer = (
  node: HTMLElement,
  pointer: number,
  onMove: (event: PointerEvent) => void,
  onEnd: (event: Event) => void
): () => void => {
  try {
    node.setPointerCapture?.(pointer)
  } catch {
    // The pointer is already gone, as after a synthetic event.
  }
  const listening = new AbortController()
  const options = { signal: listening.signal }
  const own = (f: (event: PointerEvent) => void) => (event: PointerEvent) => {
    if (event.pointerId === pointer) f(event)
  }
  const document = node.ownerDocument
  document.addEventListener(
    "pointermove",
    own((event) => {
      onMove(event)
      if (event.buttons === 0) onEnd(event)
    }),
    options
  )
  document.addEventListener("pointerup", own(onEnd), options)
  document.addEventListener("pointercancel", own(onEnd), options)
  node.addEventListener("lostpointercapture", own(onEnd), options)
  document.defaultView?.addEventListener("blur", onEnd, options)
  return () => {
    listening.abort()
    if (node.hasPointerCapture?.(pointer) === true) {
      node.releasePointerCapture(pointer)
    }
  }
}
