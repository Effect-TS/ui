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
import * as Context from "effect/Context"
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

// Home on a stack of its own, inside the outer stack's first screen.
const Nest = Native.component({
  name: "Nest",
  model: Schema.Null,
  message: Schema.Never
}).make({
  init: () => null,
  update: ($) => $.model,
  view: (h) =>
    Stack(h, {
      entries: [{ id: 0, route: null }],
      screen: (s) => Home(s, { key: "home" })
    })
})

const makeApp = (nested: boolean) =>
  Native.component({
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
            Home: () =>
              nested ? Nest(s, { key: "nest" }) : Home(s, { key: "home" }),
            Person: ({ params }) =>
              Person(s, { key: "person", props: { id: params.id } })
          })
      })
  })

const App = makeApp(false)
const NestedApp = makeApp(true)

const start = async (launched: string | null = null, nested = false) => {
  let router: Router.Router | undefined
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
      router = Context.get(context, Router.Router)
      return yield* Effect.flatMap(
        NativeRouter.props(AppRoute),
        (props) => Renderer.mount(nested ? NestedApp : App, props, container)
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
    run: async (effect: Effect.Effect<unknown>) => {
      Effect.runSync(effect)
      await settle()
    },
    router: router!,
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

  it.each([false, true])(
    "gives Back to the top screen's handler before a covered screen's, even one started later (nested: %s)",
    async (nested) => {
      const app = await start(null, nested)
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
    }
  )

  it("goes back to the screen a replace covered, though its route is the same", async () => {
    const app = await start()
    await app.press("count 0")
    await app.press("count 1")
    await app.press("Ada")
    await app.run(app.router.replace(AppRoute.Home()))
    assert.isTrue(app.shown("count 0"))
    assert.strictEqual(app.screens().length, 2)
    await app.back()
    assert.strictEqual(app.screens().length, 1)
    assert.isTrue(app.shown("count 2"))
    await app.back()
    assert.strictEqual(app.exits(), 1)
    await app.close()
  })

  it("adds a screen for a #hash link, which Back removes", async () => {
    const app = await start()
    await app.press("Ada")
    await app.run(app.router.navigate("/people/1#bio"))
    assert.strictEqual(app.screens().length, 3)
    await app.back()
    assert.strictEqual(app.screens().length, 2)
    await app.back()
    assert.strictEqual(app.screens().length, 1)
    assert.strictEqual(app.exits(), 0)
    await app.back()
    assert.strictEqual(app.exits(), 1)
    await app.close()
  })

  it("presses and follows links activated without a pointer", async () => {
    const app = await start()
    const link = app.find((n) => n.props.accessibilityRole === "link")
    // Android sends a click only to a focusable view.
    assert.strictEqual(link.props.focusable, true)
    // A touch's click has a pointer, and the touch has already pressed.
    app.fabric.emit(link, "topClick", { pointerId: 1, pointerType: "touch" })
    await app.settle()
    assert.strictEqual(app.router.location().index, 0)
    // TalkBack activates the Pressable, around the text.
    const counter = app.find((n) =>
      n.children.some((c) => c.children.some(FakeFabric.byText("count 0")))
    )
    app.fabric.emit(counter, "topClick", {})
    await app.settle()
    assert.isTrue(app.shown("count 1"))
    app.fabric.emit(link, "topClick", {})
    await app.settle()
    assert.strictEqual(app.router.location().index, 1)
    assert.isTrue(app.shown("person 1 backs 0"))
    await app.close()
  })

  it("moves the screen reader's focus to a screen that replaces the first", async () => {
    const app = await start()
    await app.run(app.router.replace(AppRoute.Person({ params: { id: 1 } })))
    const [person] = app.screens()
    assert.isTrue(app.shown("person 1 backs 0"))
    assert.deepStrictEqual(app.focused(), [person!.tag])
    assert.deepStrictEqual(app.announced(), [])
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

  it("starts at / for a deep link the routes don't parse, and ignores one that arrives later", async () => {
    const app = await start("myapp://missing")
    assert.isTrue(app.shown("count 0"))
    app.fake.emit("url", { url: "myapp://missing" })
    await app.settle()
    assert.strictEqual(app.screens().length, 1)
    assert.deepStrictEqual(app.opened(), [])
    await app.close()
  })

  const launchedAt = (
    routes: Router.Routes,
    url: string | null,
    prefixes: NativeRouter.Options["prefixes"]
  ) => {
    const linking = FakeDevice.module({
      getInitialURL: () => Promise.resolve(url)
    })
    const { device } = FakeDevice.make("android", {
      IntentAndroid: linking.module
    })
    return Effect.runPromise(
      Effect.map(Router.Router, (router) => router.location().url).pipe(
        Effect.provide(NativeRouter.layer({ routes, prefixes })),
        Effect.provideService(Native.Device, device)
      )
    )
  }

  it("starts a deep link the routes don't parse at their catch-all", async () => {
    const routes = Route.union({
      Home: Route.make("/"),
      NotFound: Route.make("/*")
    })
    assert.strictEqual(
      await launchedAt(routes, "myapp://missing", ["myapp://"]),
      "/missing"
    )
  })

  it("resolves deep links and the fallback under the routes' base", async () => {
    const routes = Route.union({
      Home: Route.make("/"),
      About: Route.make("/about")
    })
    routes.setBase("#")
    const prefixes = (url: string) =>
      url.startsWith("myapp://") ? "#/" + url.slice(8) : undefined
    assert.strictEqual(
      await launchedAt(routes, "myapp://about", prefixes),
      "#/about"
    )
    assert.strictEqual(
      await launchedAt(routes, "myapp://missing", prefixes),
      "#/"
    )
    assert.strictEqual(await launchedAt(routes, null, prefixes), "#/")
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
  it("keeps the top entry's id for a route on the same page, and never reuses an id", () => {
    const person = (id: number) => AppRoute.Person({ params: { id } })
    const ids = (stack: NativeRouter.Stack<typeof AppRoute.Type>) =>
      stack.map((entry) => entry.id)
    let stack: NativeRouter.Stack<typeof AppRoute.Type> = [
      { id: 0, route: AppRoute.Home() },
      { id: 1, route: person(1) }
    ]
    stack = NativeRouter.follow(AppRoute, stack, {
      index: 1,
      id: 2,
      route: person(2)
    })
    assert.deepStrictEqual(ids(stack), [0, 2])
    stack = NativeRouter.follow(AppRoute, stack, {
      index: 1,
      id: 3,
      route: person(2)
    })
    assert.deepStrictEqual(ids(stack), [0, 2])
    // A new entry's id is never one the stack holds.
    stack = NativeRouter.follow(AppRoute, stack, {
      index: 2,
      id: 2,
      route: person(2)
    })
    assert.deepStrictEqual(ids(stack), [0, 2, 3])
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
