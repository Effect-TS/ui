/**
 * The OpenTUI host for `@effect/ui`: mounts a component tree onto an OpenTUI
 * `CliRenderer` (or test renderer), manages controlled input/select/focus
 * state, bridges global terminal events, and owns the renderer's lifecycle.
 *
 * @stability experimental
 * @since 0.1.0
 */
import type * as Component from "@effect/ui/Component"
import * as Renderer from "@effect/ui/Renderer"
import type * as View from "@effect/ui/View"
import * as OT from "@opentui/core"
import * as Context from "effect/Context"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Equal from "effect/Equal"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import type * as AsyncResult from "effect/reactivity/AsyncResult"
import type * as Scope from "effect/Scope"
import * as OpenTui from "./OpenTui.ts"
import * as OpenTuiSubscription from "./OpenTuiSubscription.ts"

/**
 * Constructor type for custom OpenTUI renderables registered through
 * `renderables` on {@link makeHost} or {@link layer}.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type RenderableConstructor = new(
  ctx: OT.RenderContext,
  options: any
) => OT.BaseRenderable

/**
 * Options accepted by {@link makeHost}.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface MakeHostOptions {
  readonly renderables?:
    | Readonly<Record<string, RenderableConstructor>>
    | undefined
  readonly onTitle?: ((title: string) => void) | undefined
}

/**
 * Configuration accepted by {@link layer}, {@link mount}, {@link mountEffect},
 * and {@link run}.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface LayerConfig
  extends OT.CliRendererConfig, Pick<MakeHostOptions, "renderables">
{}

/**
 * Passes when a root component renders OpenTUI elements or is host-neutral,
 * and otherwise names the host its vocabulary requires.
 *
 * @stability experimental
 * @category utility types
 * @since 0.1.0
 */
export type OpenTuiRoot<V> = [Renderer.HostOf<V>] extends [OpenTui.Host]
  ? unknown
  : {
    readonly "OpenTuiHost.mount shows OpenTUI elements. This root's vocabulary needs":
      Renderer.HostOf<V>
  }

/**
 * Options accepted by {@link mount}, {@link mountEffect}, and {@link run}.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface MountOptions<
  V extends View.Elements,
  RF = never,
  Events = unknown
> {
  /** Receives the root's events in emission order, as for `Renderer.mount`. */
  readonly onEmit?: ((event: Events) => void) | undefined
  readonly fallback?:
    | ((
      failure: AsyncResult.Failure<never, unknown>,
      h: View.WithTags<never, {}, V>
    ) => View.Content<never, RF>)
    | undefined
  readonly query?: Renderer.QueryOptions | undefined
  readonly head?: boolean | undefined
  readonly renderer?: LayerConfig | undefined
}

const builtInCatalogue: Readonly<Record<string, RenderableConstructor>> = {
  box: OT.BoxRenderable,
  scrollbox: OT.ScrollBoxRenderable,
  lineNumber: OT.LineNumberRenderable,
  text: OT.TextRenderable,
  input: OT.InputRenderable,
  textarea: OT.TextareaRenderable,
  select: OT.SelectRenderable,
  tabSelect: OT.TabSelectRenderable,
  slider: OT.SliderRenderable,
  code: OT.CodeRenderable,
  diff: OT.DiffRenderable,
  markdown: OT.MarkdownRenderable,
  asciiFont: OT.ASCIIFontRenderable
}

const textTagAttributes: Readonly<Record<string, number>> = {
  span: OT.TextAttributes.NONE,
  b: OT.TextAttributes.BOLD,
  i: OT.TextAttributes.ITALIC,
  u: OT.TextAttributes.UNDERLINE,
  a: OT.TextAttributes.NONE
}

const controlledProps: ReadonlySet<string> = new Set([
  "value",
  "selectedIndex",
  "focused"
])

const resettableProps: ReadonlySet<string> = new Set([
  "border",
  "borderStyle",
  "shouldFill",
  "visible",
  "opacity",
  "wrapMode",
  "textAlign",
  "truncate",
  "showDescription",
  "showSelectionIndicator",
  "showScrollIndicator",
  "showScrollArrows",
  "showUnderline",
  "tabWidth",
  "wrapSelection",
  "orientation",
  "viewPortSize",
  "conceal",
  "concealCode",
  "drawUnstyledText",
  "streaming",
  "syncScroll",
  "view",
  "showLineNumbers",
  "lineNumberOffset",
  "content",
  "diff",
  "text",
  "font",
  "selectable",
  "stickyScroll",
  "scrollX",
  "scrollY",
  "titleAlignment",
  "bottomTitleAlignment",
  "attributes"
])

const textDecoder = new TextDecoder()

class Slot {
  readonly text: OT.TextNodeRenderable
  layout: OT.BoxRenderable | undefined = undefined
  parent: HostNode | undefined = undefined
  constructor(text: OT.TextNodeRenderable) {
    this.text = text
  }
}

class Container {
  readonly children: Array<HostNode> = []
}

type HostNode = OT.BaseRenderable | Slot | Container

type Selectable = OT.SelectRenderable | OT.TabSelectRenderable

type Controlled = OT.TextareaRenderable | Selectable | OT.SliderRenderable

const isSelectable = (node: OT.BaseRenderable): node is Selectable =>
  node instanceof OT.SelectRenderable || node instanceof OT.TabSelectRenderable

const isControlled = (
  node: OT.BaseRenderable,
  name: string
): node is Controlled =>
  name === "value"
    ? node instanceof OT.TextareaRenderable ||
      node instanceof OT.SliderRenderable
    : name === "selectedIndex" && isSelectable(node)

const syntaxStyles = new WeakMap<OT.CliRenderer, OT.SyntaxStyle>()

const defaultSyntaxStyle = (renderer: OT.CliRenderer): OT.SyntaxStyle => {
  let style = syntaxStyles.get(renderer)
  if (style === undefined) {
    style = OT.SyntaxStyle.create(renderer.nativeScene)
    syntaxStyles.set(renderer, style)
  }
  return style
}

const destroyRenderable = (node: OT.BaseRenderable | undefined): void => {
  if (node === undefined) return
  if (node instanceof OT.Renderable && node.isDestroyed) return
  node.destroyRecursively()
}

const destroyHostNode = (node: OT.BaseRenderable | Slot): void => {
  if (node instanceof Slot) {
    destroyRenderable(node.layout)
    destroyRenderable(node.text)
    return
  }
  destroyRenderable(node)
}

const isTextParent = (node: HostNode): boolean =>
  node instanceof OT.TextRenderable || OT.isTextNodeRenderable(node)

const realParent = (node: OT.BaseRenderable): OT.BaseRenderable | undefined => {
  const parent = node.parent ?? undefined
  if (parent instanceof OT.RootTextNodeRenderable) return parent.textParent
  return parent
}

const detach = (child: OT.BaseRenderable): void => {
  const parent = realParent(child)
  // `LineNumberRenderable.remove` throws for a live target.
  if (parent instanceof OT.LineNumberRenderable) parent.clearTarget()
  else parent?.remove(child)
}

const childrenOf = (
  node: OT.BaseRenderable
): ReadonlyArray<OT.BaseRenderable> =>
  node instanceof OT.TextRenderable
    ? node.getTextChildren()
    : node.getChildren()

const mapOf = (
  maps: WeakMap<OT.BaseRenderable, Map<string, unknown>>,
  node: OT.BaseRenderable
): Map<string, unknown> => {
  let map = maps.get(node)
  if (map === undefined) {
    map = new Map()
    maps.set(node, map)
  }
  return map
}

const keyPayloadOf = (
  key: OT.KeyEvent,
  renderer: OT.CliRenderer
): OpenTui.KeyPayload => ({
  key: key.name,
  sequence: key.sequence,
  ctrl: key.ctrl,
  shift: key.shift,
  meta: key.meta,
  option: key.option,
  repeat: key.repeated === true || key.eventType === "repeat",
  eventType: key.eventType,
  editable: renderer.currentFocusedEditor !== null
})

const mousePayloadOf = (event: OT.MouseEvent): OpenTui.MousePayload => ({
  x: event.x,
  y: event.y,
  button: event.button,
  shift: event.modifiers.shift,
  alt: event.modifiers.alt,
  ctrl: event.modifiers.ctrl,
  ...(event.scroll !== undefined
    ? {
      scroll: {
        direction: event.scroll.direction,
        delta: event.scroll.delta
      }
    }
    : {})
})

const pastePayloadOf = (event: OT.PasteEvent): OpenTui.PastePayload => ({
  text: textDecoder.decode(event.bytes)
})

type PayloadOf = (event: any, renderer: OT.CliRenderer) => object

const cancellableEvents: Readonly<
  Record<string, readonly [property: string, payloadOf: PayloadOf]>
> = {
  mousedown: ["onMouseDown", mousePayloadOf],
  mouseup: ["onMouseUp", mousePayloadOf],
  mousemove: ["onMouseMove", mousePayloadOf],
  mouseover: ["onMouseOver", mousePayloadOf],
  mouseout: ["onMouseOut", mousePayloadOf],
  mousescroll: ["onMouseScroll", mousePayloadOf],
  keydown: ["onKeyDown", keyPayloadOf],
  paste: ["onPaste", pastePayloadOf]
}

interface EventEntry {
  handlers: Readonly<Record<string, View.Handler<unknown, any>>>
  options: Readonly<Record<string, View.EventOptions>>
  dispatch: Renderer.Dispatch
  readonly wired: Set<string>
}

const makeHostService = (
  renderer: OT.CliRenderer
): Context.Service.Shape<typeof OpenTui.Host> => ({
  focus: (node) => {
    if (!node.isDestroyed) node.focus()
  },
  blur: (node) => {
    if (!node.isDestroyed) node.blur()
  },
  scrollTo: (node, position) => {
    if (!node.isDestroyed) node.scrollTo(position as any)
  },
  scrollBy: (node, delta) => {
    if (!node.isDestroyed) node.scrollBy(delta as any)
  },
  measure: (node) => ({
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height
  }),
  quit: () => {
    if (!renderer.isDestroyed) renderer.destroy()
  }
})

const makeGlobalEvents = (
  renderer: OT.CliRenderer
): OpenTuiSubscription.GlobalEvents => ({
  listen: (event, listener) => {
    if (event === "resize") {
      const handler = (width: number, height: number) => {
        listener(
          { width, height, defaultPrevented: false } as any,
          () => {}
        )
      }
      renderer.on(OT.CliRenderEvents.RESIZE, handler)
      return () => {
        renderer.off(OT.CliRenderEvents.RESIZE, handler)
      }
    }
    const keyEvent: "keypress" | "keyrelease" | "paste" = event
    const payloadOf: PayloadOf = keyEvent === "paste"
      ? pastePayloadOf
      : keyPayloadOf
    const handler = (input: OT.KeyEvent | OT.PasteEvent) => {
      const payload = {
        ...payloadOf(input, renderer),
        defaultPrevented: input.defaultPrevented
      }
      listener(payload as any, () => input.preventDefault())
    }
    renderer.keyInput.on(keyEvent, handler)
    return () => {
      renderer.keyInput.off(keyEvent, handler)
    }
  }
})

/**
 * Builds a `Renderer.Host` over an OpenTUI `CliRenderer`.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const makeHost = (
  renderer: OT.CliRenderer,
  options?: MakeHostOptions | undefined
): Renderer.Host<HostNode> => {
  const catalogue: Record<string, RenderableConstructor> = {
    ...builtInCatalogue,
    ...options?.renderables
  }
  // OpenTUI's RenderContext omits `| undefined` under exactOptionalPropertyTypes.
  const renderCtx = renderer as unknown as OT.RenderContext
  let nextId = 0
  let lastTitle: string | undefined

  const slots = new WeakMap<OT.BaseRenderable, Slot>()
  const containerParent = new WeakMap<HostNode, Container>()
  const events = new WeakMap<OT.BaseRenderable, EventEntry>()
  const wanted = new WeakMap<Controlled, string | number>()
  const initialProps = new WeakMap<OT.BaseRenderable, Map<string, unknown>>()
  const lastProps = new WeakMap<OT.BaseRenderable, Map<string, unknown>>()
  const lineNumberVisibility = new WeakMap<OT.LineNumberRenderable, boolean>()
  const controlledWired = new WeakSet<OT.BaseRenderable>()
  let suppressing = false

  const detached = new Set<HostNode>()
  const pendingFocus = new Map<OT.Renderable, boolean>()
  const pendingRevert = new Set<Controlled>()
  let revertScheduled = false

  const real = (node: HostNode, parent?: HostNode): OT.BaseRenderable => {
    if (!(node instanceof Slot)) return node as OT.BaseRenderable
    if (parent === undefined) return node.layout ?? node.text
    if (isTextParent(parent)) return node.text
    if (node.layout === undefined) {
      node.layout = new OT.BoxRenderable(renderCtx, {
        id: `slot-${nextId++}`,
        visible: false,
        width: 0,
        height: 0
      })
      slots.set(node.layout, node)
    }
    return node.layout
  }

  const wrap = (renderable: OT.BaseRenderable): HostNode =>
    slots.get(renderable) ?? renderable

  const isAttachedToLiveTree = (node: OT.Renderable): boolean => {
    let at: HostNode | undefined = node
    while (at !== undefined) {
      if (at === renderer.root) return true
      if (at instanceof Container) return false
      const parked = containerParent.get(at)
      if (parked !== undefined) return false
      at = at instanceof Slot ? at.parent : realParent(at)
    }
    return false
  }

  const write = (node: Controlled, value: string | number): boolean => {
    const current = node instanceof OT.TextareaRenderable
      ? node.plainText
      : node instanceof OT.SliderRenderable
      ? node.value
      : node.getSelectedIndex()
    if (current === value) return false
    suppressing = true
    try {
      if (node instanceof OT.TextareaRenderable) {
        const text = value as string
        const cursor = node.cursorOffset
        if (node instanceof OT.InputRenderable) node.value = text
        else node.setText(text)
        node.cursorOffset = cursor >= (current as string).length
          ? text.length
          : Math.min(cursor, text.length)
      } else if (node instanceof OT.SliderRenderable) {
        node.value = value as number
      } else {
        node.setSelectedIndex(value as number)
      }
    } finally {
      suppressing = false
    }
    return true
  }

  const revertNode = (node: Controlled): boolean => {
    const value = wanted.get(node)
    return value !== undefined && !node.isDestroyed && write(node, value)
  }

  const flushReverts = (): void => {
    revertScheduled = false
    let changed = false
    for (const node of pendingRevert) {
      if (revertNode(node)) changed = true
    }
    pendingRevert.clear()
    if (changed && !renderer.isDestroyed) renderer.requestRender()
  }

  const scheduleRevert = (node: Controlled): void => {
    pendingRevert.add(node)
    if (!revertScheduled) {
      revertScheduled = true
      queueMicrotask(flushReverts)
    }
  }

  const fire = (
    node: OT.BaseRenderable,
    name: string,
    payload: unknown,
    onMessage?: (() => void) | undefined
  ): boolean => {
    const entry = events.get(node)
    if (entry === undefined) return false
    const handler = entry.handlers[name]
    if (handler === undefined) return false
    return entry.dispatch(name, handler, payload, onMessage)
  }

  const afterEdit = (node: Controlled, handled: boolean): void => {
    if (!wanted.has(node)) return
    if (handled) scheduleRevert(node)
    else if (revertNode(node) && !renderer.isDestroyed) renderer.requestRender()
  }

  const ensureControlledListener = (node: OT.BaseRenderable): void => {
    if (controlledWired.has(node)) return
    controlledWired.add(node)
    if (node instanceof OT.InputRenderable) {
      node.on(OT.InputRenderableEvents.INPUT, (value: string) => {
        if (suppressing) return
        afterEdit(node, fire(node, "input", { value: value ?? node.value }))
      })
    } else if (node instanceof OT.TextareaRenderable) {
      node.onContentChange = () => {
        if (suppressing) return
        afterEdit(node, fire(node, "input", { value: node.plainText }))
      }
    } else if (isSelectable(node)) {
      node.on(
        OT.SelectRenderableEvents.SELECTION_CHANGED,
        (index: number, option: OT.SelectOption | null) => {
          if (suppressing) return
          afterEdit(
            node,
            fire(node, "selectionChanged", { index, option: option ?? null })
          )
        }
      )
    } else if (node instanceof OT.SliderRenderable) {
      node.on("change", () => {
        if (suppressing) return
        afterEdit(node, fire(node, "change", { value: node.value }))
      })
    }
  }

  const cancellableListener = (
    entry: EventEntry,
    name: string,
    payloadOf: PayloadOf
  ) =>
  (event: OT.MouseEvent | OT.KeyEvent | OT.PasteEvent): void => {
    const handler = entry.handlers[name]
    if (handler === undefined) return
    // Renderer.Host contract: only the innermost element with a handler receives an event.
    event.stopPropagation()
    const prevent = entry.options[name]?.preventDefault
    if (prevent === "always") event.preventDefault()
    entry.dispatch(
      name,
      handler,
      payloadOf(event, renderer),
      prevent === true ? () => event.preventDefault() : undefined
    )
  }

  const detachFromContainer = (node: HostNode): void => {
    const container = containerParent.get(node)
    if (container === undefined) return
    const index = container.children.indexOf(node)
    if (index >= 0) container.children.splice(index, 1)
    containerParent.delete(node)
  }

  return {
    createElement(tag) {
      if (tag === "br") {
        return OT.TextNodeRenderable.fromString("\n", { id: `br-${nextId++}` })
      }
      if (tag in textTagAttributes) {
        return new OT.TextNodeRenderable({
          id: `${tag}-${nextId++}`,
          attributes: textTagAttributes[tag]!
        })
      }
      const Ctor = catalogue[tag]
      if (Ctor === undefined) {
        throw new Error(`Unknown OpenTUI tag: <${tag}>`)
      }
      const id = `${tag}-${nextId++}`
      if (Ctor === OT.SliderRenderable) {
        return new OT.SliderRenderable(renderCtx, {
          id,
          orientation: "horizontal"
        })
      }
      if (Ctor === OT.CodeRenderable || Ctor === OT.MarkdownRenderable) {
        return new Ctor(renderCtx, {
          id,
          syntaxStyle: defaultSyntaxStyle(renderer)
        })
      }
      return new Ctor(renderCtx, { id })
    },

    createText(text) {
      const node = OT.TextNodeRenderable.fromString(text, {
        id: `t-${nextId++}`
      })
      const slot = new Slot(node)
      slots.set(node, slot)
      return slot
    },

    setText(node, text) {
      if (node instanceof Slot) {
        node.text.children = [text]
      }
    },

    setAttr(node, name, value) {
      if (node instanceof Slot || node instanceof Container) return
      ;(node as unknown as Record<string, unknown>)[name] = value
    },

    setProp(node, name, value) {
      if (node instanceof Slot || node instanceof Container) return
      if (name === "focused") {
        if (node instanceof OT.Renderable) {
          pendingFocus.set(node, Boolean(value))
        }
        return
      }
      if (
        name === "showLineNumbers" && node instanceof OT.LineNumberRenderable
      ) {
        // The gutter is rebuilt for each child, so `insertBefore` reapplies this.
        const show = value === undefined ? true : Boolean(value)
        lineNumberVisibility.set(node, show)
        node.showLineNumbers = show
        return
      }
      if (isControlled(node, name)) {
        ensureControlledListener(node)
        if (value === undefined) {
          wanted.delete(node)
        } else {
          const coerced = node instanceof OT.TextareaRenderable
            ? String(value)
            : Number(value)
          wanted.set(node, coerced)
          write(node, coerced)
        }
        return
      }
      if (typeof value === "object" && value !== null) {
        const last = mapOf(lastProps, node)
        if (Equal.equals(last.get(name), value)) return
        last.set(name, value)
      } else {
        lastProps.get(node)?.delete(name)
      }
      const target = node as unknown as Record<string, unknown>
      let next = value
      if (resettableProps.has(name)) {
        const initial = mapOf(initialProps, node)
        if (!initial.has(name)) initial.set(name, target[name])
        if (value === undefined) {
          next = initial.get(name)
        } else if (name === "attributes" && OT.isTextNodeRenderable(node)) {
          next = (initial.get(name) as number) |
            (typeof value === "number" ? value : 0)
        }
      }
      if (
        (name === "options" && isSelectable(node)) ||
        ((name === "min" || name === "max") &&
          node instanceof OT.SliderRenderable)
      ) {
        // These setters clamp the current value, so reassert the controlled one.
        suppressing = true
        try {
          target[name] = next
        } finally {
          suppressing = false
        }
        revertNode(node)
      } else {
        target[name] = next
      }
    },

    insertBefore(parent, node, ref) {
      detached.delete(node)
      detachFromContainer(node)
      if (parent instanceof Container) {
        detach(real(node))
        if (node instanceof Slot) node.parent = parent
        containerParent.set(node, parent)
        const index = ref === undefined ? -1 : parent.children.indexOf(ref)
        if (index < 0) parent.children.push(node)
        else parent.children.splice(index, 0, node)
        return
      }
      if (node instanceof Slot) node.parent = parent
      const child = real(node, parent)
      const target = parent as OT.BaseRenderable
      if (target instanceof OT.LineNumberRenderable) {
        if (child instanceof OT.Renderable) {
          target.add(child)
          const show = lineNumberVisibility.get(target)
          if (show !== undefined) target.showLineNumbers = show
        }
      } else if (ref === undefined) {
        target.add(child)
      } else {
        target.insertBefore(child, real(ref, parent))
      }
    },

    remove(node) {
      if (containerParent.has(node)) {
        detachFromContainer(node)
      } else {
        detach(real(node))
      }
      if (node instanceof Slot) node.parent = undefined
      detached.add(node)
    },

    parentOf(node) {
      const container = containerParent.get(node)
      if (container !== undefined) return container
      if (node instanceof Slot) return node.parent
      if (node instanceof Container) return undefined
      return realParent(node)
    },

    nextOf(node) {
      const container = containerParent.get(node)
      if (container !== undefined) {
        const index = container.children.indexOf(node)
        return index >= 0 ? container.children[index + 1] : undefined
      }
      if (node instanceof Container) return undefined
      const child = real(node)
      const parent = realParent(child)
      if (parent === undefined) return undefined
      const siblings = childrenOf(parent)
      const index = siblings.indexOf(child)
      if (index < 0) return undefined
      const next = siblings[index + 1]
      return next === undefined ? undefined : wrap(next)
    },

    setEvents(node, handlers, dispatch, eventOptions) {
      if (node instanceof Slot || node instanceof Container) return
      let entry = events.get(node)
      if (entry === undefined) {
        entry = {
          handlers,
          options: eventOptions,
          dispatch,
          wired: new Set()
        }
        events.set(node, entry)
      } else {
        entry.handlers = handlers
        entry.options = eventOptions
        entry.dispatch = dispatch
      }
      for (const name in handlers) {
        if (entry.wired.has(name)) continue
        entry.wired.add(name)
        const cancellable = cancellableEvents[name]
        if (cancellable !== undefined) {
          ;(node as unknown as Record<string, unknown>)[cancellable[0]] =
            cancellableListener(entry, name, cancellable[1])
        } else if (name === "focus") {
          node.on(OT.RenderableEvents.FOCUSED, () => {
            fire(node, "focus", {})
          })
        } else if (name === "blur") {
          node.on(OT.RenderableEvents.BLURRED, () => {
            fire(node, "blur", {})
          })
        } else if (
          name === "input" ||
          name === "selectionChanged" ||
          (name === "change" && node instanceof OT.SliderRenderable)
        ) {
          ensureControlledListener(node)
        } else if (name === "change" || name === "enter") {
          node.on(name, (value?: string) => {
            if (suppressing) return
            fire(node, name, {
              value: value ??
                (node instanceof OT.InputRenderable ? node.value : "")
            })
          })
        } else if (name === "submit" && node instanceof OT.TextareaRenderable) {
          node.onSubmit = () => {
            fire(node, "submit", { value: node.plainText })
          }
        } else if (name === "itemSelected") {
          node.on(
            OT.SelectRenderableEvents.ITEM_SELECTED,
            (index: number, option: OT.SelectOption | null) => {
              fire(node, "itemSelected", { index, option: option ?? null })
            }
          )
        }
      }
    },

    elements: [OpenTui.name],
    controlled: controlledProps,
    runsMounts: true,

    createContainer() {
      return new Container()
    },

    commit() {
      for (const node of detached) {
        if (node instanceof Container || containerParent.has(node)) continue
        const child = real(node)
        if (realParent(child) === undefined) destroyHostNode(node)
      }
      detached.clear()
      for (const [node, focused] of pendingFocus) {
        if (!focused && !node.isDestroyed && node.focused) node.blur()
      }
      for (const [node, focused] of pendingFocus) {
        if (
          focused &&
          !node.isDestroyed &&
          !node.focused &&
          isAttachedToLiveTree(node)
        ) {
          node.focus()
        }
      }
      pendingFocus.clear()
      if (!renderer.isDestroyed) renderer.requestRender()
    },

    head(head) {
      const title =
        (head as { readonly title?: string | undefined } | undefined)
          ?.title
      if (title !== undefined && title !== lastTitle) {
        lastTitle = title
        if (options?.onTitle !== undefined) options.onTitle(title)
        else if (!renderer.isDestroyed) renderer.setTerminalTitle(title)
      }
    }
  }
}

const makeContext = (
  renderer: OT.CliRenderer,
  options?: MakeHostOptions | undefined
): Context.Context<Renderer.Renderer | OpenTui.Host> =>
  Context.make(Renderer.Renderer, { host: makeHost(renderer, options) }).pipe(
    Context.add(OpenTui.Host, makeHostService(renderer)),
    Context.add(OpenTuiSubscription.GlobalEvents, makeGlobalEvents(renderer))
  )

const acquireRenderer = (
  config: OT.CliRendererConfig
): Effect.Effect<OT.CliRenderer, never, Scope.Scope> =>
  Effect.acquireRelease(
    Effect.promise(() => OT.createCliRenderer(config)),
    (renderer) =>
      Effect.promise(async () => {
        if (!renderer.isDestroyed) renderer.destroy()
        await renderer.closed
      })
  )

/**
 * Provides `Renderer.Renderer`, `OpenTui.Host`, and
 * `OpenTuiSubscription.GlobalEvents` for an existing `CliRenderer`.
 *
 * @stability experimental
 * @category layers
 * @since 0.1.0
 */
export const layerFromRenderer = (
  renderer: OT.CliRenderer,
  options?: MakeHostOptions | undefined
): Layer.Layer<Renderer.Renderer | OpenTui.Host> =>
  Layer.succeedContext(makeContext(renderer, options))

/**
 * Creates and owns a `CliRenderer` for the life of the Layer, providing
 * `Renderer.Renderer`, `OpenTui.Host`, and `OpenTuiSubscription.GlobalEvents`.
 *
 * @stability experimental
 * @category layers
 * @since 0.1.0
 */
export const layer = (
  config?: LayerConfig | undefined
): Layer.Layer<Renderer.Renderer | OpenTui.Host> => {
  const { renderables, ...rendererConfig } = config ?? {}
  return Layer.effectContext(
    Effect.map(
      acquireRenderer(rendererConfig),
      (renderer) => makeContext(renderer, { renderables })
    )
  )
}

/**
 * Mounts an OpenTUI component tree onto a `CliRenderer` owned for the life of
 * the current Scope, returning its `Renderer.Root`.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const mountEffect = <
  Name extends string,
  Props,
  Model,
  Msg,
  Events,
  R,
  V extends View.Elements,
  RF = never,
  RP = never
>(
  component:
    & Component.Members<Name, Props, Model, Msg, Events, R, V, any>
    & OpenTuiRoot<V>,
  props: Props | Effect.Effect<Props, never, RP>,
  options?: MountOptions<V, RF, Events> | undefined
): Effect.Effect<
  Renderer.Root<Model, Msg>,
  never,
  Exclude<R | RF | RP, OpenTui.Host> | Scope.Scope
> =>
  Effect.gen(function*() {
    const { renderables, ...rendererConfig } = options?.renderer ?? {}
    const renderer = yield* acquireRenderer(rendererConfig)
    return yield* Effect.provideContext(
      Renderer.mount(component as any, props as any, renderer.root, options),
      makeContext(renderer, { renderables })
    )
  }) as any

/**
 * A Layer that creates a `CliRenderer` and mounts `component` for as long as
 * the Layer is alive.
 *
 * @stability experimental
 * @category layers
 * @since 0.1.0
 */
export const mount = <
  Name extends string,
  Props,
  Model,
  Msg,
  Events,
  R,
  V extends View.Elements,
  RF = never,
  RP = never
>(
  component:
    & Component.Members<Name, Props, Model, Msg, Events, R, V, any>
    & OpenTuiRoot<V>,
  props: Props | Effect.Effect<Props, never, RP>,
  options?: MountOptions<V, RF, Events> | undefined
): Layer.Layer<never, never, Exclude<R | RF | RP, OpenTui.Host>> =>
  Layer.effectDiscard(mountEffect(component, props, options)) as any

/**
 * Runs an OpenTUI application until the terminal renderer is destroyed (via
 * Ctrl+C, an exit signal, or `OpenTuiCommand.quit()`), then closes its Scope.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const run = <
  Name extends string,
  Props,
  Model,
  Msg,
  Events,
  R,
  V extends View.Elements,
  RF = never,
  RP = never
>(
  component:
    & Component.Members<Name, Props, Model, Msg, Events, R, V, any>
    & OpenTuiRoot<V>,
  props: Props | Effect.Effect<Props, never, RP>,
  options?: MountOptions<V, RF, Events> | undefined
): Effect.Effect<void, never, Exclude<R | RF | RP, OpenTui.Host>> =>
  Effect.scoped(
    Effect.gen(function*() {
      const done = yield* Deferred.make<void>()
      yield* mountEffect(component, props, {
        ...options,
        renderer: {
          ...options?.renderer,
          onDestroy: () => {
            options?.renderer?.onDestroy?.()
            Deferred.doneUnsafe(done, Exit.void)
          }
        }
      })
      yield* Deferred.await(done)
    })
  ) as any
