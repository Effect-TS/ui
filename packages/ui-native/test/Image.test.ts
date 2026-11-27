import { Image } from "@effect/ui-native/kit/Image"
import { ImageBackground } from "@effect/ui-native/kit/ImageBackground"
import * as Native from "@effect/ui-native/Native"
import * as NativeHost from "@effect/ui-native/NativeHost"
import * as Renderer from "@effect/ui/Renderer"
import * as UiSchema from "@effect/ui/UiSchema"
import * as Schema from "effect/Schema"
import { assert, describe, it, vi } from "vitest"
import * as FakeFabric from "./utils/FakeFabric.ts"

const env = vi.hoisted(() => {
  const assets: Array<Record<string, unknown>> = []
  const state = {
    scriptURL: null as string | null,
    dimensions: { window: { scale: 1 } } as Record<string, unknown>
  }
  return {
    state,
    registerAsset(asset: Record<string, unknown>): number {
      return assets.push(asset)
    },
    getAssetByID(id: number): Record<string, unknown> | undefined {
      return assets[id - 1]
    }
  }
})

vi.mock("react-native/asset-registry", () => ({
  registerAsset: env.registerAsset,
  getAssetByID: env.getAssetByID
}))

vi.mock("react-native/Libraries/TurboModule/TurboModuleRegistry", () => ({
  get(name: string) {
    if (name === "SourceCode") {
      return { getConstants: () => ({ scriptURL: env.state.scriptURL }) }
    }
    if (name === "DeviceInfo") {
      return { getConstants: () => ({ Dimensions: env.state.dimensions }) }
    }
    return null
  }
}))

const Message = UiSchema.TaggedEnum({
  SetMode: {
    mode: Schema.Literals([
      "asset",
      "inline",
      "undefKey",
      "acceptHeader",
      "multi",
      "clear",
      "noEvents"
    ])
  },
  Bump: {},
  Loaded: { width: Schema.Number, height: Schema.Number },
  Progressed: { loaded: Schema.Number, total: Schema.Number },
  Failed: { error: Schema.String },
  Started: {},
  Ended: {}
})

describe("Image and ImageBackground", () => {
  it("renders sources, defaults, intrinsic asset size, Android headers, events and skips identical inline objects", async () => {
    env.state.scriptURL = "http://localhost:8081/index.bundle?platform=android"
    env.state.dimensions = { windowPhysicalPixels: { scale: 2 } }
    const logo = env.registerAsset({
      httpServerLocation: "/assets/src/assets",
      width: 24,
      height: 24,
      scales: [1, 2, 3],
      hash: "abc123",
      name: "mark",
      type: "png"
    })
    const unsized = env.registerAsset({
      httpServerLocation: "/assets/src/assets",
      scales: [1],
      hash: "u1",
      name: "vec",
      type: "xml"
    })

    const Screen = Native.component({
      name: "Screen",
      model: Schema.Struct({
        mode: Schema.Literals([
          "asset",
          "inline",
          "undefKey",
          "acceptHeader",
          "multi",
          "clear",
          "noEvents"
        ]),
        tick: Schema.Number,
        events: Schema.Array(Schema.String)
      }),
      message: Message
    }).make({
      init: () => ({ mode: "asset" as const, tick: 0, events: [] }),
      update: {
        SetMode: ($, { mode }) => $.evolve({ mode }),
        Bump: ($) => $.evolve({ tick: (n) => n + 1 }),
        Started: ($) => $.evolve({ events: (e) => [...e, "start"] }),
        Progressed: ($, { loaded, total }) =>
          $.evolve({ events: (e) => [...e, `progress:${loaded}/${total}`] }),
        Loaded: ($, { width, height }) =>
          $.evolve({ events: (e) => [...e, `load:${width}x${height}`] }),
        Failed: ($, { error }) =>
          $.evolve({ events: (e) => [...e, `error:${error}`] }),
        Ended: ($) => $.evolve({ events: (e) => [...e, "end"] })
      },
      view: (h, model) => {
        const img = model.mode === "asset"
          ? Image(h, { source: logo, blurRadius: 2 })
            .style({ width: 48, tintColor: "#111827" })
            .on("loadStart", Message.Started())
            .on(
              "progress",
              ({ loaded, total }) => Message.Progressed({ loaded, total })
            )
            .on(
              "load",
              ({ source }) =>
                Message.Loaded({ width: source.width, height: source.height })
            )
            .on("error", ({ error }) => Message.Failed({ error: error ?? "" }))
            .on("loadEnd", Message.Ended())
          : model.mode === "inline"
          ? Image(h, {
            source: {
              uri: "https://example.com/a.png",
              headers: { Authorization: "Bearer tok" }
            }
          }).style({ resizeMode: "contain", overflow: "visible" })
          : model.mode === "undefKey"
          ? Image(h, {
            source: { uri: "https://example.com/b.png", width: undefined }
          })
          : model.mode === "acceptHeader"
          ? Image(h, {
            source: {
              uri: "https://example.com/b.png",
              headers: { Accept: "image/webp" }
            }
          })
          : model.mode === "multi"
          ? Image(h, {
            source: [
              unsized,
              { uri: "https://example.com/hi.png", width: 200, height: 100 }
            ]
          })
          : model.mode === "clear"
          ? Image(h, { source: "https://example.com/b.png" })
          : Image(h, { source: "https://example.com/c.png" }).on(
            "press",
            Message.Bump()
          )
        return h.view.children(
          img,
          h.text.children(`${model.tick}:${model.events.join(",")}`)
        )
      }
    })

    const { fabric, find, printed, root, settle } = await FakeFabric.mount(
      (container) => Renderer.mount(Screen, {}, container),
      (color) => `color:${String(color)}`
    )

    const img = () => find(FakeFabric.byName("RCTImageView"))
    assert.deepStrictEqual(img().props.source, [{
      __packager_asset: true,
      uri:
        "http://localhost:8081/assets/src/assets/mark@2x.png?platform=android&hash=abc123",
      width: 24,
      height: 24,
      scale: 2
    }])
    assert.strictEqual(img().props.width, 48)
    assert.strictEqual(img().props.height, 24)
    assert.strictEqual(img().props.resizeMode, "cover")
    assert.strictEqual(img().props.overflow, "hidden")
    assert.strictEqual(img().props.blurRadius, 2)
    assert.strictEqual(img().props.tintColor, "color:#111827")
    assert.strictEqual(img().props.shouldNotifyLoadEvents, true)

    fabric.emit(img(), "topLoadStart", {})
    fabric.emit(img(), "topProgress", { progress: 0.5, loaded: 5, total: 10 })
    fabric.emit(img(), "topLoad", {
      source: {
        uri: "http://localhost:8081/mark@2x.png",
        width: 48,
        height: 48
      }
    })
    fabric.emit(img(), "topError", { error: "404" })
    fabric.emit(img(), "topLoadEnd", {})
    await settle()
    assert.include(
      printed(),
      "0:start,progress:5/10,load:48x48,error:404,end"
    )

    // Inline source object sets Android headers and doesn't re-clone on unrelated re-render.
    root.send(Message.SetMode({ mode: "inline" }))
    await settle()
    assert.deepStrictEqual(img().props.source, [{
      uri: "https://example.com/a.png",
      headers: { Authorization: "Bearer tok" }
    }])
    assert.deepStrictEqual(img().props.headers, { Authorization: "Bearer tok" })
    assert.strictEqual(img().props.resizeMode, "contain")
    assert.strictEqual(img().props.overflow, "visible")
    assert.isUndefined(img().props.shouldNotifyLoadEvents)

    const before = img()
    root.send(Message.Bump())
    await settle()
    assert.strictEqual(img(), before)

    // Removing style overrides restores defaults; clearing Android headers sends an empty map.
    root.send(Message.SetMode({ mode: "clear" }))
    await settle()
    assert.deepStrictEqual(img().props.source, [{
      uri: "https://example.com/b.png"
    }])
    assert.deepStrictEqual(img().props.headers, {})
    assert.strictEqual(img().props.resizeMode, "cover")
    assert.strictEqual(img().props.overflow, "hidden")

    // Source equality checks key membership, not just key count.
    root.send(Message.SetMode({ mode: "undefKey" }))
    await settle()
    root.send(Message.SetMode({ mode: "acceptHeader" }))
    await settle()
    assert.deepStrictEqual(img().props.headers, { Accept: "image/webp" })

    // Multi-source candidates always carry numeric width/height for Android.
    root.send(Message.SetMode({ mode: "multi" }))
    await settle()
    assert.deepStrictEqual(img().props.source, [
      {
        __packager_asset: true,
        uri: "src_assets_vec",
        width: 0,
        height: 0,
        scale: 1
      },
      { uri: "https://example.com/hi.png", width: 200, height: 100 }
    ])

    root.send(Message.SetMode({ mode: "noEvents" }))
    await settle()
    assert.isUndefined(img().props.shouldNotifyLoadEvents)
  })

  it("resolves assets for Android APK, Android file bundle, iOS bundle, and XML on dev server", () => {
    const resolve = (
      os: string,
      scriptURL: string | null,
      dimensions: Record<string, unknown>,
      asset: Record<string, unknown>
    ) => {
      env.state.scriptURL = scriptURL
      env.state.dimensions = dimensions
      const id = env.registerAsset(asset)
      const fabric = FakeFabric.make()
      const { host, root } = NativeHost.make({
        ui: fabric.ui,
        rootTag: 1,
        os,
        processColor: (c) => c
      })
      const node = host.createElement("image")
      host.setProp(node, "source", id)
      host.insertBefore(root, node, undefined)
      host.commit!()
      return (FakeFabric.find(
        fabric.committed(),
        FakeFabric.byName("RCTImageView")
      )!.props.source as ReadonlyArray<Record<string, unknown>>)[0]!
    }

    // Android APK release (assets://) uses sanitized resource identifier.
    assert.deepStrictEqual(
      resolve(
        "android",
        "assets://index.android.bundle",
        { windowPhysicalPixels: { scale: 3 } },
        {
          httpServerLocation: "/assets/src/my-icons",
          width: 32,
          height: 32,
          scales: [1, 2, 3],
          hash: "h1",
          name: "hero-logo.v2",
          type: "png"
        }
      ),
      {
        __packager_asset: true,
        uri: "src_myicons_herologov2",
        width: 32,
        height: 32,
        scale: 3
      }
    )

    // Android sideloaded file:// bundle (CodePush style) resolves drawable-<density>.
    assert.deepStrictEqual(
      resolve(
        "android",
        "file:///data/user/0/app/files/bundle/index.android.bundle",
        { windowPhysicalPixels: { scale: 2 } },
        {
          httpServerLocation: "/assets/src",
          width: 16,
          height: 16,
          scales: [1, 2, 3],
          hash: "h2",
          name: "logo",
          type: "png"
        }
      ),
      {
        __packager_asset: true,
        uri: "file:///data/user/0/app/files/bundle/drawable-xhdpi/src_logo.png",
        width: 16,
        height: 16,
        scale: 2
      }
    )

    // iOS release bundle resolves near scriptURL, escaping `../` and picking largest available scale.
    assert.deepStrictEqual(
      resolve(
        "ios",
        "file:///var/containers/App/main.jsbundle",
        { window: { scale: 4 } },
        {
          httpServerLocation: "/assets/../shared",
          width: 20,
          height: 20,
          scales: [1, 2, 3],
          hash: "h3",
          name: "mark",
          type: "png"
        }
      ),
      {
        __packager_asset: true,
        uri: "file:///var/containers/App/assets/_shared/mark@3x.png",
        width: 20,
        height: 20,
        scale: 3
      }
    )

    // Android XML drawables cannot load over HTTP even on a dev server.
    assert.strictEqual(
      resolve(
        "android",
        "http://localhost:8081/index.bundle",
        { windowPhysicalPixels: { scale: 2 } },
        {
          httpServerLocation: "/assets/src",
          scales: [1],
          hash: "h4",
          name: "vec",
          type: "xml"
        }
      ).uri,
      "src_vec"
    )
  })

  it("renders ImageBackground with the image filling behind children", async () => {
    env.state.scriptURL = "assets://index.android.bundle"
    env.state.dimensions = { windowPhysicalPixels: { scale: 2 } }
    const bg = env.registerAsset({
      httpServerLocation: "/assets/src",
      width: 200,
      height: 100,
      scales: [1, 2],
      hash: "bg1",
      name: "bg",
      type: "png"
    })

    const Card = Native.component({
      name: "Card",
      model: Schema.Null,
      message: Schema.Never
    }).make({
      init: () => null,
      update: ($) => $.model,
      view: (h) =>
        ImageBackground(h, { source: bg, imageStyle: { opacity: 0.5 } })
          .style({ flex: 1 })
          .children(h.text.children("Over the image"))
    })

    const { find, printed } = await FakeFabric.mount((container) =>
      Renderer.mount(Card, {}, container)
    )
    assert.strictEqual(
      printed(),
      "<RCTView><RCTImageView></><RCTText>Over the image</></>"
    )
    const image = find(FakeFabric.byName("RCTImageView"))
    assert.strictEqual(image.props.position, "absolute")
    assert.strictEqual(image.props.top, 0)
    assert.strictEqual(image.props.right, 0)
    assert.strictEqual(image.props.bottom, 0)
    assert.strictEqual(image.props.left, 0)
    assert.strictEqual(image.props.opacity, 0.5)
    // Intrinsic asset size is cleared so insets fill the container.
    assert.isUndefined(image.props.width)
    assert.isUndefined(image.props.height)
  })
})
