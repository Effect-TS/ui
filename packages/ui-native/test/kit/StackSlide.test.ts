import { Pressable } from "@effect/ui-native/kit/Pressable"
import { Stack } from "@effect/ui-native/kit/Stack"
import * as StackSlide from "@effect/ui-native/kit/StackSlide"
import * as StackSwipe from "@effect/ui-native/kit/StackSwipe"
import * as Native from "@effect/ui-native/Native"
import * as NativeRouter from "@effect/ui-native/NativeRouter"
import * as Renderer from "@effect/ui/Renderer"
import * as Route from "@effect/ui/Route"
import * as Router from "@effect/ui/Router"
import * as UiSchema from "@effect/ui/UiSchema"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import { assert, describe, it, vi } from "vitest"
import * as FakeAnimated from "../utils/FakeAnimated.ts"
import * as FakeDevice from "../utils/FakeDevice.ts"
import * as FakeFabric from "../utils/FakeFabric.ts"

const native = vi.hoisted(() => ({ animated: undefined as any }))
vi.mock(
  "react-native/Libraries/TurboModule/TurboModuleRegistry",
  () => ({ get: () => native.animated.module })
)
vi.mock(
  "react-native/Libraries/StyleSheet/processColor",
  () => ({ default: (color: unknown) => color })
)
vi.mock(
  "react-native/Libraries/Components/Sound/NativeSoundManager",
  () => ({ default: null })
)
native.animated = FakeAnimated.make()
const animated: ReturnType<typeof FakeAnimated.make> = native.animated

const AppRoute = Route.union({
  Home: Route.make("/"),
  Person: Route.make("/people/:id", { params: { id: Schema.Number } })
})

const PersonMessage = UiSchema.TaggedEnum({ Dirtied: {} })

const Person = Native.component({
  name: "Person",
  props: Schema.Struct({ id: Schema.Number }),
  model: Schema.Struct({ dirty: Schema.Boolean }),
  message: PersonMessage
}).make({
  init: () => ({ dirty: false }),
  update: { Dirtied: ($) => $.evolve({ dirty: (dirty) => !dirty }) },
  subscriptions: ({ model }) => [model.dirty && Router.blocked("form")],
  view: (h) =>
    h.view.children(
      h.text(`person ${h.props.id}`),
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
          Home: () => s.text("home"),
          Person: ({ params }) =>
            Person(s, { key: "person", props: { id: params.id } })
        }),
      transition: StackSlide.slide({ swipeBack: StackSwipe.swipeBack() })
    })
})

const idle = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0))
}

const start = async (os = "ios") => {
  let router: Router.Router | undefined
  const fake = FakeDevice.make(os, {})
  const mounted = await FakeFabric.mount(
    (container) =>
      Effect.gen(function*() {
        const context = yield* Layer.build(
          NativeRouter.layer({ routes: AppRoute })
        )
        router = Context.get(context, Router.Router)
        return yield* Effect.flatMap(
          NativeRouter.props(AppRoute),
          (props) => Renderer.mount(App, props, container)
        ).pipe(Effect.provide(context))
      }).pipe(Effect.provideService(Native.Device, fake.device)),
    undefined,
    os
  )
  const { fabric, find } = mounted
  const stack = () => find((n) => n.props.overflow === "hidden")
  fabric.emit(stack(), "topLayout", {
    layout: { x: 0, y: 0, width: 300, height: 600 }
  })
  await idle()
  // Each screen's translateX and opacity, bottom first.
  const screens = () =>
    stack().children.map((n) => {
      const shown = animated.view(n.tag) as any
      return [shown?.transform[0].translateX, shown?.opacity]
    })
  let t = 0
  const at = (x: number, down = true) => {
    const touch = { pageX: x, pageY: 100, timestamp: t += 1000 }
    return { touches: down ? [touch] : [], changedTouches: [touch] }
  }
  // Drags from `from` through `to`, then lifts the finger, or cancels.
  const swipe = async (
    from: number,
    to: ReadonlyArray<number>,
    end: "topTouchEnd" | "topTouchCancel" = "topTouchEnd"
  ) => {
    const target = find(FakeFabric.byText("person 1"))
    fabric.emit(target, "topTouchStart", at(from))
    for (const x of to) {
      fabric.emit(target, "topTouchMove", at(x))
      await idle()
    }
    const last = screens()
    fabric.emit(target, end, at(to[to.length - 1]!, false))
    await idle()
    return last
  }
  const run = async (effect: Effect.Effect<unknown>) => {
    Effect.runSync(effect)
    await idle()
  }
  const finish = async () => {
    animated.finish()
    await idle()
  }
  return { ...mounted, router: router!, screens, swipe, run, finish }
}

// A runtime recognizes one touch at a time, so the tests take turns.
describe("StackSlide", { concurrent: false }, () => {
  it("slides a pushed screen in and a popped one out, keeping it until it is off", async () => {
    const app = await start()
    assert.deepStrictEqual(app.screens(), [[0, 1]])
    await app.run(app.router.navigate("/people/1"))
    // The new screen starts off the trailing edge.
    assert.deepStrictEqual(app.screens(), [[0, 1], [300, 1]])
    assert.strictEqual(animated.running(), 2)
    await app.finish()
    assert.deepStrictEqual(app.screens(), [[-90, 0], [0, 1]])

    await app.run(app.router.back)
    assert.deepStrictEqual(app.screens(), [[-90, 1], [0, 1]])
    await app.finish()
    assert.deepStrictEqual(app.screens(), [[0, 1]])
    await app.close()
  })

  it("drags the top screen with a swipe from the left edge, and goes back past half", async () => {
    const app = await start()
    await app.run(app.router.navigate("/people/1"))
    await app.finish()
    // A swipe that starts away from the edge isn't taken.
    assert.deepStrictEqual(await app.swipe(100, [200]), [[-90, 0], [0, 1]])

    assert.deepStrictEqual(await app.swipe(10, [60, 210]), [[-30, 1], [200, 1]])
    assert.strictEqual(app.router.location().index, 0)
    await app.finish()
    assert.deepStrictEqual(app.screens(), [[0, 1]])
    await app.close()
  })

  it("takes no swipe on Android", async () => {
    const app = await start("android")
    await app.run(app.router.navigate("/people/1"))
    await app.finish()
    assert.deepStrictEqual(await app.swipe(10, [60, 210]), [[-90, 0], [0, 1]])
    assert.strictEqual(app.router.location().index, 1)
    await app.close()
  })

  it.each(["topTouchEnd", "topTouchCancel"] as const)(
    "springs back on a short swipe, a cancelled one, and one while Back is blocked (%s)",
    async (end) => {
      const app = await start()
      await app.run(app.router.navigate("/people/1"))
      await app.finish()
      const back = async (to: number) => {
        await app.swipe(10, [60, to], end)
        assert.strictEqual(app.router.location().index, 1)
        await app.finish()
        assert.deepStrictEqual(app.screens(), [[-90, 0], [0, 1]])
      }
      if (end === "topTouchEnd") {
        await back(110)
        FakeFabric.touch(app.fabric, app.find(FakeFabric.byText("dirty")))
        await idle()
        assert.isTrue(app.router.blocked())
      }
      await back(210)
      await app.close()
    }
  )
})
