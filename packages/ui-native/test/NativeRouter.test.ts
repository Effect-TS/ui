import * as BackHandler from "@effect/ui-native/kit/BackHandler"
import { Link } from "@effect/ui-native/kit/Link"
import { Pressable } from "@effect/ui-native/kit/Pressable"
import { Stack } from "@effect/ui-native/kit/Stack"
import * as Native from "@effect/ui-native/Native"
import * as NativeRouter from "@effect/ui-native/NativeRouter"
import * as Head from "@effect/ui/Head"
import * as Renderer from "@effect/ui/Renderer"
import * as Route from "@effect/ui/Route"
import * as Router from "@effect/ui/Router"
import * as UiSchema from "@effect/ui/UiSchema"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import { assert, describe, it, vi } from "vitest"
import * as FakeDevice from "./utils/FakeDevice.ts"
import * as FakeFabric from "./utils/FakeFabric.ts"

vi.mock(
  "react-native/Libraries/StyleSheet/processColor",
  () => ({ default: (color: unknown) => color })
)
vi.mock(
  "react-native/Libraries/Components/Sound/NativeSoundManager",
  () => ({ default: undefined })
)

const AppRoute = Route.union({
  Home: Route.make("/"),
  Person: Route.make("/people/:id", { params: { id: Schema.Number } })
})

const HomeMessage = UiSchema.TaggedEnum({ Counted: {}, Backed: {} })

// Takes Back while its count is odd.
const Home = Native.component({
  name: "Home",
  model: Schema.Struct({ count: Schema.Number, backs: Schema.Number }),
  message: HomeMessage
}).make({
  init: () => ({ count: 0, backs: 0 }),
  update: {
    Counted: ($) => $.evolve({ count: (count) => count + 1 }),
    Backed: ($) => $.evolve({ backs: (backs) => backs + 1 })
  },
  subscriptions: ({ model }) => [
    model.count % 2 === 1 && BackHandler.onPress(HomeMessage.Backed())
  ],
  head: () => [Head.title("Home")],
  view: (h, model) =>
    h.view.children(
      Pressable(h, { onPress: HomeMessage.Counted() }).children(
        h.text(`count ${model.count}`)
      ),
      h.text(`home backs ${model.backs}`),
      Link(h, { href: AppRoute.print(AppRoute.Person({ params: { id: 1 } })) })
        .children(h.text("Ada")),
      Link(h, { href: "https://effect.website" }).children(h.text("Docs"))
    )
})

const PersonMessage = UiSchema.TaggedEnum({
  Toggled: {},
  Dirtied: {},
  Backed: {}
})

const Person = Native.component({
  name: "Person",
  props: Schema.Struct({ id: Schema.Number }),
  model: Schema.Struct({
    taking: Schema.Boolean,
    dirty: Schema.Boolean,
    backs: Schema.Number
  }),
  message: PersonMessage
}).make({
  init: () => ({ taking: false, dirty: false, backs: 0 }),
  update: {
    Toggled: ($) => $.evolve({ taking: (taking) => !taking }),
    Dirtied: ($) => $.evolve({ dirty: (dirty) => !dirty }),
    Backed: ($) => $.evolve({ backs: (backs) => backs + 1 })
  },
  subscriptions: ({ model }) => [
    model.taking && BackHandler.onPress(PersonMessage.Backed()),
    model.dirty && Router.blocked("form")
  ],
  head: ($) => [Head.title(`Person ${$.props.id}`)],
  view: (h, model) =>
    h.view.children(
      h.text(`person ${h.props.id} backs ${model.backs}`),
      Pressable(h, { onPress: PersonMessage.Toggled() }).children(
        h.text("take back")
      ),
      Pressable(h, { onPress: PersonMessage.Dirtied() }).children(
        h.text("dirty")
      )
    )
})

const AppMessage = UiSchema.TaggedEnum({
  Navigated: { navigation: NativeRouter.Navigation(AppRoute) }
})

const App = Native.component({
  name: "App",
  props: Schema.Struct({ stack: NativeRouter.Stack(AppRoute) }),
  model: NativeRouter.Stack(AppRoute),
  message: AppMessage
}).make({
  init: ($) => $.props.stack,
  update: {
    Navigated: ($, { navigation }) =>
      $.set(NativeRouter.follow(AppRoute, $.model, navigation))
  },
  subscriptions: ({ model }) => [
    NativeRouter.subscription(
      AppRoute,
      model,
      (navigation) => AppMessage.Navigated({ navigation })
    )
  ],
  view: (h, stack) =>
    Stack(h, {
      entries: stack,
      screen: (s, { route }) =>
        AppRoute.match(route, {
          Home: () => Home(s, { key: "home" }),
          Person: ({ params }) =>
            Person(s, { key: "person", props: { id: params.id } })
        })
    })
})

const start = async (launched: string | null = null) => {
  const titles: Array<string | undefined> = []
  const back = FakeDevice.module()
  const linking = FakeDevice.module({
    getInitialURL: () => Promise.resolve(launched),
    openURL: () => Promise.resolve()
  })
  const a11y = FakeDevice.module()
  const fake = FakeDevice.make("android", {
    DeviceEventManager: back.module,
    IntentAndroid: linking.module,
    AccessibilityInfo: a11y.module
  })
  const mounted = await FakeFabric.mount((container) =>
    Effect.gen(function*() {
      const context = yield* Layer.build(
        NativeRouter.layer({
          routes: AppRoute,
          prefixes: ["myapp://"],
          onSettled: ({ title }) => titles.push(title)
        })
      )
      return yield* Effect.flatMap(
        NativeRouter.props(AppRoute),
        (props) => Renderer.mount(App, props, container)
      ).pipe(Effect.provide(context))
    }).pipe(Effect.provideService(Native.Device, fake.device))
  )
  const { fabric, settle } = mounted
  const shown = (text: string) =>
    FakeFabric.find(fabric.committed(), FakeFabric.byText(text)) !== undefined
  const press = async (text: string) => {
    FakeFabric.touch(fabric, mounted.find(FakeFabric.byText(text)))
    await settle()
  }
  const back_ = async () => {
    fake.emit("hardwareBackPress")
    await settle()
  }
  const screens = () => {
    const out: Array<FakeFabric.ShadowNode> = []
    const walk = (nodes: ReadonlyArray<FakeFabric.ShadowNode>) => {
      for (const n of nodes) {
        if (n.props.position === "absolute") out.push(n)
        walk(n.children)
      }
    }
    walk(fabric.committed())
    return out
  }
  const calls = (module: ReturnType<typeof FakeDevice.module>, name: string) =>
    module.calls.filter(([method]) => method === name).map(([, ...args]) =>
      args
    )
  return {
    ...mounted,
    fake,
    titles,
    shown,
    press,
    back: back_,
    screens,
    exits: () => calls(back, "invokeDefaultBackPressHandler").length,
    opened: () => calls(linking, "openURL").map(([url]) => url),
    announced: () =>
      calls(a11y, "announceForAccessibility").map(([text]) => text),
    focused: () =>
      fabric.accessibilityEvents.filter(([, type]) => type === "focus").map((
        [tag]
      ) => tag)
  }
}

// A runtime recognizes one touch at a time, so the tests take turns.
describe("NativeRouter", { concurrent: false }, () => {
  it("pushes on a Link, keeps the covered screen mounted, and goes back with Back until the first screen", async () => {
    const app = await start()
    await app.press("count 0")
    await app.press("count 1")
    await app.press("Ada")
    assert.isTrue(app.shown("person 1 backs 0"))
    const [home, person] = app.screens()
    assert.strictEqual(app.screens().length, 2)
    assert.include(home!.props, {
      opacity: 0,
      pointerEvents: "none",
      importantForAccessibility: "no-hide-descendants",
      accessibilityElementsHidden: true
    })
    assert.include(person!.props, { opacity: 1, pointerEvents: "auto" })
    assert.deepStrictEqual(app.focused(), [person!.tag])

    await app.back()
    assert.isFalse(app.shown("person 1 backs 0"))
    assert.isTrue(app.shown("count 2"))
    assert.strictEqual(app.screens().length, 1)
    assert.include(app.screens()[0]!.props, { opacity: 1 })
    assert.deepStrictEqual(app.focused(), [person!.tag, home!.tag])
    assert.strictEqual(app.exits(), 0)

    await app.back()
    assert.strictEqual(app.exits(), 1)
    await app.close()
    assert.strictEqual(app.fake.listening("hardwareBackPress"), 0)
  })

  it("gives Back to the top screen's handler before a covered screen's, even one started later", async () => {
    const app = await start()
    await app.press("Ada")
    await app.press("take back")
    // The covered Home starts its handler after Person's.
    await app.press("count 0")
    await app.back()
    assert.isTrue(app.shown("person 1 backs 1"))
    assert.isTrue(app.shown("home backs 0"))

    await app.press("take back")
    await app.back()
    assert.isTrue(app.shown("home backs 0"))
    assert.isFalse(app.shown("person 1 backs 1"))

    await app.back()
    assert.isTrue(app.shown("home backs 1"))
    assert.strictEqual(app.exits(), 0)
    await app.close()
  })

  it("does nothing on Back while a block is held", async () => {
    const app = await start()
    await app.press("Ada")
    await app.press("dirty")
    await app.back()
    assert.isTrue(app.shown("person 1 backs 0"))
    assert.strictEqual(app.exits(), 0)
    await app.press("dirty")
    await app.back()
    assert.isFalse(app.shown("person 1 backs 0"))
    await app.close()
  })

  it("starts at the deep link that launched the app, pushes later ones, and ignores other URLs", async () => {
    const app = await start("myapp://people/7")
    assert.isTrue(app.shown("person 7 backs 0"))
    assert.strictEqual(app.screens().length, 1)

    app.fake.emit("url", { url: "myapp://people/8" })
    await app.settle()
    assert.isTrue(app.shown("person 8 backs 0"))
    assert.strictEqual(app.screens().length, 2)

    app.fake.emit("url", { url: "other://people/9" })
    await app.settle()
    assert.strictEqual(app.screens().length, 2)

    await app.back()
    assert.isTrue(app.shown("person 7 backs 0"))
    await app.back()
    assert.strictEqual(app.exits(), 1)
    await app.close()
  })

  it("starts at / when the launching URL isn't a deep link", async () => {
    const app = await start("exp+app://expo-development-client/?url=x")
    assert.isTrue(app.shown("count 0"))
    await app.close()
  })

  it("opens an href the routes don't parse with Linking", async () => {
    const app = await start()
    await app.press("Docs")
    await new Promise((r) => setTimeout(r, 0))
    assert.deepStrictEqual(app.opened(), ["https://effect.website"])
    assert.strictEqual(app.screens().length, 1)
    await app.close()
  })

  it("settles with the top screen's title, and announces nothing", async () => {
    const app = await start()
    await app.press("Ada")
    await app.settle()
    await app.back()
    await app.settle()
    assert.deepStrictEqual(app.titles, ["Person 1", "Home"])
    assert.deepStrictEqual(app.announced(), [])
    await app.close()
  })
})

describe("NativeRouter.follow", () => {
  const home = AppRoute.Home()
  const person = (id: number) => AppRoute.Person({ params: { id } })
  const nav = (
    action: Router.Action,
    index: number,
    id: number,
    route: typeof AppRoute.Type
  ) => ({ action, index, id, route })

  it("pushes, replaces, and pops to the entries the stack holds", () => {
    let stack: NativeRouter.Stack<typeof AppRoute.Type> = [{
      id: 0,
      route: home
    }]
    stack = NativeRouter.follow(AppRoute, stack, nav("push", 1, 1, person(1)))
    stack = NativeRouter.follow(AppRoute, stack, nav("push", 2, 2, person(2)))
    assert.deepStrictEqual(stack.map((e) => e.id), [0, 1, 2])
    // Another page replaces the top screen, and the same page keeps it.
    stack = NativeRouter.follow(
      AppRoute,
      stack,
      nav("replace", 2, 3, person(3))
    )
    assert.deepStrictEqual(stack.map((e) => e.id), [0, 1, 3])
    stack = NativeRouter.follow(
      AppRoute,
      stack,
      nav("replace", 2, 4, person(3))
    )
    assert.deepStrictEqual(stack.map((e) => e.id), [0, 1, 3])
    stack = NativeRouter.follow(AppRoute, stack, nav("pop", 0, 5, home))
    assert.deepStrictEqual(stack, [{ id: 0, route: home }])
    // Forward again is a new screen.
    stack = NativeRouter.follow(AppRoute, stack, nav("pop", 1, 6, person(1)))
    assert.deepStrictEqual(stack.map((e) => e.id), [0, 6])
  })

  it("keeps the top screen for a followed link to it, and never reuses an id", () => {
    let stack: NativeRouter.Stack<typeof AppRoute.Type> = [
      { id: 0, route: home },
      { id: 1, route: person(1) }
    ]
    // Delivered again, with the push's action and seq.
    stack = NativeRouter.follow(AppRoute, stack, nav("push", 1, 1, person(1)))
    assert.deepStrictEqual(stack.map((e) => e.id), [0, 1])
    // A #hash push on it: a new entry, delivered with the same seq.
    stack = NativeRouter.follow(AppRoute, stack, nav("push", 2, 1, person(1)))
    assert.deepStrictEqual(stack.map((e) => e.id), [0, 1, 2])
  })
})

describe("NativeRouter.pathOf", () => {
  it("routes a URL that starts with a prefix, with the rest as its path", () => {
    const prefixes = ["myapp://", "https://example.com"]
    assert.strictEqual(
      NativeRouter.pathOf(prefixes, "myapp://people/1?tab=a"),
      "/people/1?tab=a"
    )
    assert.strictEqual(
      NativeRouter.pathOf(prefixes, "https://example.com/people/1"),
      "/people/1"
    )
    assert.strictEqual(
      NativeRouter.pathOf(prefixes, "https://example.com"),
      "/"
    )
    assert.strictEqual(
      NativeRouter.pathOf(prefixes, "https://example.community/x"),
      undefined
    )
    assert.strictEqual(NativeRouter.pathOf(prefixes, "other://x"), undefined)
    assert.strictEqual(
      NativeRouter.pathOf((url) => url.slice(3), "abc/x"),
      "/x"
    )
  })
})
