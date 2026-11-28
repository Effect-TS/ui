# `@effect/ui-native`

React Native vocabulary and Fabric host for `@effect/ui`. Apps render native views through Fabric without React, and run in Expo or any React Native app on the New Architecture.

## Requirements

- Peer dependencies: `effect`, `@effect/ui`, `react-native` (`>=0.88.0`), and `vite` (`^8`) for pre-bundled release builds
- The New Architecture (Fabric) and Hermes

## Modules

- `Native`: `Native.component`, `Native.H`, the element vocabulary (`view`, `text`, `scroll`, `input`), style, prop and event types, `Native.Host`, `Native.Device`, `Native.clear`, `Native.setSelection`, and `Native.defineView` for custom native views
- `@effect/ui-native/kit`: native controls and APIs beyond the vocabulary, bundled only when imported. `Css` parses CSS strings into the style forms native reads, `Image` and `ImageBackground` render images, `RefreshControl` adds pull to refresh, and `Modal`, `SafeArea`, `Drawer` and `InputAccessory` are screen containers. `Pressable` adds press states, a pressed style and the Android ripple; `Pan` handles drags after a configurable movement threshold. `Animation` animates `opacity` and `transform` on React Native's native driver, and `LayoutAnimation` animates a step's layout changes. `KeyboardAvoidingView` keeps content above the keyboard, and the device APIs come as namespaces (`AccessibilityInfo`, `Alert`, `AppState`, `Appearance`, `BackHandler`, `Dimensions`, `I18nManager`, `Keyboard`, `Linking`, `PermissionsAndroid`, `PlatformColor`, `Share`, `StatusBar`, `Vibration`)
- `@effect/ui-native/assets`: ambient TypeScript declarations for static image imports (`import logo from "./logo.png"`)
- `NativeHost`: `make`, the `Renderer.Host` that builds Fabric shadow trees and commits them to a surface
- `NativeApp`: `mount`, `mountEffect`, and `register`, which runs an app on every surface native starts; the `Surface` service, whose `props` follow the surface's props as native updates them
- `@effect/ui-native/networking`: opt-in side-effect entry that installs React Native's networking globals (`fetch`, `XMLHttpRequest`, `WebSocket`, `URL`, `AbortController`)
- `@effect/ui-native/node`: `NativeMetro.withEffectUi`, the Metro configuration

## Setup

The module the bundle starts at registers the app:

```ts
// src/main.ts
import * as NativeApp from "@effect/ui-native/NativeApp"
import { App } from "./App.ts"

NativeApp.register(NativeApp.mount(App, {}))
```

Point `main` in `package.json` at it, and wrap the Metro configuration:

```ts
// metro.config.ts
import { NativeMetro } from "@effect/ui-native/node"
import ExpoMetro from "expo/metro-config"

export default NativeMetro.withEffectUi(
  ExpoMetro.getDefaultConfig(import.meta.dirname)
)
```

A release build (`NODE_ENV=production`, as `expo export` and Gradle's release tasks set it) is pre-bundled with Vite, which tree-shakes `effect` and `@effect/ui`, and Metro bundles the result with React Native. Static `import`s of assets (`resolver.assetExts`) are left to Metro automatically so scale variants and files are preserved; use `import` rather than `require`, which pre-bundling rejects. Packages with native code are left to Metro: `react-native`, `expo`, and their scoped and prefixed packages by default, and any others named in the `external` option.

Each platform in `platforms` (`["android", "ios"]` by default) gets a pre-bundle using Metro's `sourceExts` and `resolverMainFields`. For each source extension, resolution tries the platform suffix, then `.native`, then no suffix. Platforms without a pre-bundle, such as web, use the sources.

An app's `resolver.resolveRequest` also runs for non-external imports in the pre-bundle:

- Return a source file, asset files, or an empty module.
- Delegate to `context.resolveRequest` to let Vite resolve an import, including a renamed import or a changed origin.
- Do not read the delegated result's `filePath` or request another platform. Either fails the release build: Vite resolves asynchronously and only for the build's platform.

In development Metro serves the sources. Editing a module that exports only components swaps them in place and keeps their state; editing any other module reloads the app.

## Device APIs

The kit's device APIs use native modules and device events directly rather than React Native's JavaScript wrappers. `NativeApp.register` provides their `Native.Device` service. Tests can provide a fake device; without one, defaults include a 0×0 window at scale 1, the `"active"` app state, and a hidden keyboard.

They come in three forms:

- Effects, such as `Linking.openURL(url)` and `Dimensions.get`. Fallible calls report `Native.DeviceError`.
- Commands for `update`, such as `Keyboard.Dismiss` and `Alert.Alert`. Commands for fallible calls return a `Result`.
- Subscriptions and Streams of device events, such as `Dimensions.onChange` and `Keyboard.changes`.

```ts
import { Command } from "@effect/ui"
import { Linking } from "@effect/ui-native/kit"

// In update:
$.run(Linking.Open.make({ url: "https://effect.website" }).pipe(Command.asNoop))
```

On Android, Back closes the app when nothing handles it. The kit's `BackHandler.onPress` handles it while its Subscription runs, and React Native's `BackHandler` takes over that default as it does in a React app. Use one of them: each closes the app when its own handlers pass on a press.

React Native doesn't load the `expo` package itself: an app that doesn't import it saves about 1 MB of Hermes bytecode.

Networking globals are opt-in, so apps that don't make requests don't bundle React Native's XHR stack. If your app uses `fetch` or `FetchHttpClient`, add `import "@effect/ui-native/networking"` to the entry module.

## Touches

The core host recognizes one touch at a time, from the first finger down to the last one lifted. Without the kit it sends `press` to the nearest element with a `press` handler, when the touch ends on that element or within 20 points of it. A scroll view takes the touch when it starts dragging under it, or when the touch starts while the scroll view is still moving. Either way no `press` is sent. Importing `Pressable` or `Pan` from the kit replaces this recognizer with one that also handles press timing and pans. A plain `.on("press")` keeps working with it.

Views support W3C pointer events (`pointerDown`, `pointerUp`, `pointerMove`, `pointerCancel`, `pointerEnter`, `pointerLeave` and `click`) for touch, mouse and stylus input. `Pressable` adds `onHoverIn` and `onHoverOut`. Enable W3C pointer events at app launch: `RCTSetDispatchW3CPointerEvents(YES)` on iOS and `ReactFeatureFlags.dispatchPointerEvents = true` on Android. `examples/native/plugins/withPointerEvents.cjs` does this for an Expo app. Native sends a pointer event to the deepest view under the pointer, and the host passes it to the nearest element that handles it. `pointerEnter` and `pointerLeave` fire only on the element entered or left.

## Styles and props

`.style()` takes React Native's style names and `.prop()` its other props, such as `testID`, `role`, `accessibilityLabel` or a `text`'s `numberOfLines`. Both are typed, and `.prop()` takes any value for a name without a type.

Styles take structured values: `transform` is `[{ rotate: "45deg" }]` rather than `"rotate(45deg)"`. To parse CSS strings, use `Css` from `@effect/ui-native/kit`. Nested colours, such as a `boxShadow`'s `color`, must be processed with `Css.color` or another `Css` helper.

These forms target React Native 0.88.1's default `enableNativeCSSParsing: false`. Enabling the flag changes how native reads `filter` drop shadows and `backgroundImage`; keep it off when using those forms or their `Css` helpers.

Use native prop names and plain style objects. React Native's `aria-*` and `id` aliases and `StyleSheet` aren't provided.

## Example

See `examples/native` and its README, which covers the development client, release builds and measuring the bundle. It is an Expo app with a counter, a controlled input, nested text, a draggable handle, and a scrolling list of pressable rows under a sticky header. Its `babel.config.cjs` runs TypeScript's type stripper before Expo's, because Metro compiles the workspace's TypeScript sources there and Flow's stripper rejects `declare` class fields.
