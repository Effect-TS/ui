import * as Animation from "@effect/ui-native/kit/Animation"
import * as LayoutAnimation from "@effect/ui-native/kit/LayoutAnimation"
import { RefreshControl } from "@effect/ui-native/kit/RefreshControl"
import * as Native from "@effect/ui-native/Native"
import * as Renderer from "@effect/ui/Renderer"
import * as UiSchema from "@effect/ui/UiSchema"
import { pipe } from "effect/Function"
import * as Schema from "effect/Schema"
import { assert, describe, it } from "vitest"
import * as FakeAnimated from "./utils/FakeAnimated.ts"
import * as FakeFabric from "./utils/FakeFabric.ts"

const animated = FakeAnimated.make()

// Mounts on a device with the native driver.
const mount = <A>(
  mount: Parameters<typeof FakeFabric.mount<A>>[0],
  os = "android"
) =>
  FakeFabric.mount(mount, {
    os,
    module: (name) =>
      name === "NativeAnimatedModule" ? animated.module : undefined
  })

const Sticky = Native.component({
  name: "Sticky",
  model: Schema.Struct({ shown: Schema.Boolean, horizontal: Schema.Boolean }),
  message: UiSchema.TaggedEnum({ Flip: {}, Hide: {} })
}).make({
  init: () => ({ shown: true, horizontal: false }),
  update: {
    Flip: ($) => $.evolve({ horizontal: (h) => !h }),
    Hide: ($) => $.evolve({ shown: () => false })
  },
  view: (h, model) => {
    const list = h.id("list")
    const y = Animation.scroll(list, "y")
    return h.view(
      model.shown && pipe(
        h.view.style({ height: 80 }),
        Animation.style({
          transform: [{
            translateY: Animation.interpolate(y, [0, 80], [0, -80], "clamp")
          }]
        })
      ),
      model.shown &&
        pipe(h.scroll.horizontal(model.horizontal), Animation.source(list))
          .children(
            pipe(
              h.view.style({ height: 400 }),
              Animation.style({
                opacity: Animation.interpolate(y, [0, 200], [1, 0], "clamp")
              })
            )
          ),
      h.view.style({ width: 1 })
    )
  }
})

const Fade = Native.component({
  name: "Fade",
  model: Schema.Struct({ open: Schema.Boolean, ended: Schema.Number }),
  message: UiSchema.TaggedEnum({ Toggled: {}, Ended: {} })
}).make({
  init: () => ({ open: true, ended: 0 }),
  update: {
    Toggled: ($) => $.evolve({ open: (open) => !open }),
    Ended: ($) => $.evolve({ ended: (n) => n + 1 })
  },
  view: (h, model) =>
    h.view(
      pipe(
        h.view.style({ height: 10 }).on("animationEnd", { _tag: "Ended" }),
        Animation.style(
          {
            opacity: model.open ? 1 : 0,
            transform: model.open ? [] : [{ scale: 0.5 }]
          },
          model.open
            ? Animation.timing({ duration: 100 })
            : Animation.immediate,
          { opacity: 0 }
        )
      ),
      pipe(h.text("ended " + model.ended), Animation.style({}))
    )
})

const Follow = Native.component({
  name: "Follow",
  model: Schema.Struct({ axis: Schema.Literals(["x", "y"]) }),
  message: UiSchema.TaggedEnum({ Switched: {} })
}).make({
  init: () => ({ axis: "y" as const }),
  update: {
    Switched: ($) => $.evolve({ axis: (axis) => axis === "y" ? "x" : "y" })
  },
  view: (h, model) => {
    const list = h.id("list")
    const offset = Animation.scroll(list, model.axis)
    return h.view(
      pipe(
        h.view.style({ height: 80 }),
        Animation.style(
          {
            opacity: 1,
            transform: [{
              translateY: Animation.interpolate(offset, [0, 100], [0, -100])
            }]
          },
          Animation.timing({ duration: 100 }),
          { opacity: 0 }
        )
      ),
      pipe(h.scroll, Animation.source(list))
    )
  }
})

const List = Native.component({
  name: "List",
  model: Schema.Struct({ rows: Schema.Number, tick: Schema.Number }),
  message: UiSchema.TaggedEnum({ Added: {}, Ticked: {} })
}).make({
  init: () => ({ rows: 1, tick: 0 }),
  update: {
    Added: ($) =>
      $.evolve({ rows: (n) => n + 1 }).viewTransition([LayoutAnimation.spring]),
    // Renders nothing new, so nothing is committed or animated.
    Ticked: ($) =>
      $.evolve({ tick: (n) => n + 1 }).viewTransition([LayoutAnimation.spring])
  },
  view: (h, model) =>
    h.view(
      Array.from({ length: model.rows }, (_, i) =>
        h.view.key(String(i)).style({ height: 20 }))
    )
})

const Pull = Native.component({
  name: "Pull",
  model: Schema.Struct({ refreshable: Schema.Boolean }),
  message: UiSchema.TaggedEnum({ Toggled: {} })
}).make({
  init: () => ({ refreshable: true }),
  update: { Toggled: ($) => $.evolve({ refreshable: (on) => !on }) },
  view: (h, model) => {
    const list = h.id("list")
    return h.view(
      pipe(
        h.view.style({ height: 80 }),
        Animation.style({
          opacity: Animation.interpolate(
            Animation.scroll(list, "y"),
            [0, 100],
            [1, 0]
          )
        })
      ),
      pipe(
        h.scroll,
        Animation.source(list),
        Animation.style({ opacity: 0.5, transform: [{ translateY: 20 }] })
      ).children(model.refreshable && RefreshControl(h))
    )
  }
})

// Like React Native's, the fake animated module is shared by every surface,
// so tests that count its nodes run one at a time.
const Panel = Native.component({
  name: "Panel",
  model: Schema.Struct({ hidden: Schema.Boolean }),
  message: UiSchema.TaggedEnum({ Toggled: {} })
}).make({
  init: () => ({ hidden: true }),
  update: { Toggled: ($) => $.evolve({ hidden: (hidden) => !hidden }) },
  view: (h, model) => {
    const panel = h.view.style({ height: 10 })
    return h.view(
      model.hidden ? pipe(panel, Animation.style({ opacity: 0 })) : panel
    )
  }
})

describe("Animation", { concurrent: false }, () => {
  it("shows the targets without a native driver, and clears them when the element stops animating", async () => {
    const { find, root, settle } = await FakeFabric.mount((root) =>
      Renderer.mount(Panel, {}, root)
    )
    const panel = () => find((n) => n.props.height === 10)
    assert.strictEqual(panel().props.opacity, 0)
    root.send({ _tag: "Toggled" })
    await settle()
    assert.isUndefined(panel().props.opacity)
  })

  it("drives a sticky header from scroll events, across recreated views, until removed", async () => {
    const before = { nodes: animated.nodes(), events: animated.events() }
    const { close, find, root, settle } = await mount((root) =>
      Renderer.mount(Sticky, {}, root)
    )
    const header = () => find((n) => n.props.height === 80)
    const hero = () => find((n) => n.props.height === 400)
    const scroller = () => find((n) => n.viewName.endsWith("ScrollView"))
    // The first frame shows each expression at offset 0.
    assert.deepStrictEqual(header().props.transform, [{ translateY: 0 }])
    assert.strictEqual(header().props.collapsable, false)
    assert.strictEqual(hero().props.opacity, 1)

    animated.scroll(scroller().tag, { y: 40 })
    assert.deepStrictEqual(animated.view(header().tag), {
      transform: [{ translateY: -40 }]
    })
    assert.deepStrictEqual(animated.view(hero().tag), { opacity: 0.8 })

    // A horizontal scroll view on Android is another native view, so it
    // and the hero inside it get new tags.
    const old = { scroller: scroller().tag, hero: hero().tag }
    root.send({ _tag: "Flip" })
    await settle()
    assert.notStrictEqual(scroller().tag, old.scroller)
    assert.notStrictEqual(hero().tag, old.hero)
    animated.scroll(old.scroller, { y: 200 })
    assert.deepStrictEqual(animated.view(hero().tag), { opacity: 0.8 })
    animated.scroll(scroller().tag, { y: 200 })
    assert.deepStrictEqual(animated.view(header().tag), {
      transform: [{ translateY: -80 }]
    })
    assert.deepStrictEqual(animated.view(hero().tag), { opacity: 0 })

    root.send({ _tag: "Hide" })
    await settle()
    assert.deepStrictEqual(
      { nodes: animated.nodes(), events: animated.events() },
      before
    )
    // The renderer reused the header's node. Native keeps the driver's last
    // values on a view, so the node gets a new one.
    const reused = find((n) => n.props.width === 1)
    assert.isUndefined(reused.props.transform)
    assert.isUndefined(animated.view(reused.tag))
    await close()
  })

  it("animates to each target from where the value is, and reports the end", async () => {
    const before = animated.nodes()
    const { close, find, printed, root, settle } = await mount((
      root
    ) => Renderer.mount(Fade, {}, root))
    const panel = () => find((n) => n.props.height === 10)
    assert.strictEqual(panel().props.opacity, 0)
    assert.strictEqual(animated.running(), 1)
    assert.isUndefined(find((n) => n.viewName === "RCTText").props.collapsable)

    // An immediate target interrupts the fade, and ends at once.
    root.send({ _tag: "Toggled" })
    await settle()
    await settle()
    assert.strictEqual(animated.running(), 0)
    assert.deepStrictEqual(animated.view(panel().tag), {
      opacity: 0,
      transform: [{ scale: 0.5 }]
    })
    assert.include(printed(), "ended 1")

    root.send({ _tag: "Toggled" })
    await settle()
    assert.strictEqual(animated.running(), 1)
    animated.finish()
    await settle()
    assert.deepStrictEqual(animated.view(panel().tag), { opacity: 1 })
    assert.include(printed(), "ended 2")
    // The end value is committed, so Fabric's shadow tree agrees.
    assert.strictEqual(panel().props.opacity, 1)

    await close()
    assert.strictEqual(animated.nodes(), before)
  })

  it("changes a graph without a mount on iOS, keeping a running fade", async () => {
    animated.ios(true)
    const before = { nodes: animated.nodes(), events: animated.events() }
    try {
      const { close, fabric, find, root, settle } = await mount(
        (root) => Renderer.mount(Follow, {}, root),
        "ios"
      )
      const header = () => find((n) => n.props.height === 80)
      const scroller = () => find((n) => n.viewName.endsWith("ScrollView"))
      animated.progress(0.5)
      // Following the other axis changes nothing Fabric commits.
      const commits = fabric.calls.completeRoot
      root.send({ _tag: "Switched" })
      await settle()
      assert.strictEqual(fabric.calls.completeRoot, commits)
      animated.scroll(scroller().tag, { x: 30, y: 60 })
      assert.deepStrictEqual(animated.view(header().tag), {
        opacity: 0.5,
        transform: [{ translateY: -30 }]
      })
      assert.strictEqual(animated.running(), 1)
      await close()
      assert.deepStrictEqual(
        { nodes: animated.nodes(), events: animated.events() },
        before
      )
    } finally {
      animated.ios(false)
    }
  })

  it("follows each surface's own scroll view", async () => {
    const before = animated.nodes()
    const a = await mount((root) => Renderer.mount(Follow, {}, root))
    const b = await mount((root) => Renderer.mount(Follow, {}, root))
    const header = (s: typeof a) => s.find((n) => n.props.height === 80).tag
    const scroller = (s: typeof a) =>
      s.find((n) => n.viewName.endsWith("ScrollView")).tag
    animated.finish()
    animated.scroll(scroller(a), { y: 40 })
    animated.scroll(scroller(b), { y: 10 })
    assert.deepStrictEqual(animated.view(header(a)), {
      opacity: 1,
      transform: [{ translateY: -40 }]
    })
    await a.close()
    animated.scroll(scroller(b), { y: 20 })
    assert.deepStrictEqual(animated.view(header(b)), {
      opacity: 1,
      transform: [{ translateY: -20 }]
    })
    await b.close()
    assert.strictEqual(animated.nodes(), before)
  })

  it("splits a wrapped scroll view's style between it and its refresh control, as Fabric does", async () => {
    const before = { nodes: animated.nodes(), events: animated.events() }
    const { close, find, root, settle } = await mount((root) =>
      Renderer.mount(Pull, {}, root)
    )
    const scroller = () => find(FakeFabric.byName("RCTScrollView"))
    const views = () =>
      [scroller(), find(FakeFabric.byName("AndroidSwipeRefreshLayout"))]
        .filter((n) => n !== undefined)
    // What each view shows: the driver's value, or else Fabric's.
    const shown = (key: string) =>
      views().map((n) => (animated.view(n.tag)?.[key] ?? n.props[key]) as any)
        .filter((v) => v !== undefined)
    const check = () => {
      assert.deepStrictEqual(shown("transform"), [[{ translateY: 20 }]])
      assert.deepStrictEqual(shown("opacity"), [0.5])
      // Scroll events still come from the scroll view.
      animated.scroll(scroller().tag, { y: 50 })
      assert.deepStrictEqual(
        animated.view(find((n) => n.props.height === 80).tag),
        { opacity: 0.5 }
      )
      animated.scroll(scroller().tag, { y: 0 })
    }
    check()
    root.send({ _tag: "Toggled" })
    await settle()
    assert.strictEqual(views().length, 1)
    check()
    root.send({ _tag: "Toggled" })
    await settle()
    assert.strictEqual(views().length, 2)
    check()
    await close()
    assert.deepStrictEqual(
      { nodes: animated.nodes(), events: animated.events() },
      before
    )
  })
})

describe("LayoutAnimation", () => {
  it("animates the commit of a step that asks for it and changes the tree", async () => {
    const { fabric, root, settle } = await mount((root) =>
      Renderer.mount(List, {}, root)
    )
    root.send({ _tag: "Added" })
    await settle()
    assert.deepStrictEqual(fabric.layouts, [undefined, {
      duration: 700,
      create: { type: "linear", property: "opacity" },
      update: { type: "spring", springDamping: 0.4 },
      delete: { type: "linear", property: "opacity" }
    }])
    root.send({ _tag: "Ticked" })
    await settle()
    assert.strictEqual(fabric.calls.configureNextLayoutAnimation, 1)
  })
})
