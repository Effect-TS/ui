# `@effect/ui-native`

React Native vocabulary and Fabric host for `@effect/ui`. Apps render native views through Fabric without React, and run in Expo or any React Native app on the New Architecture.

## Requirements

- Peer dependencies: `effect`, `@effect/ui`, `react-native` (`>=0.88.0`), and `vite` (`^8`) for pre-bundled release builds
- The New Architecture (Fabric) and Hermes

## Modules

- `Native`: `Native.component`, `Native.H`, the element vocabulary (`view`, `text`, `scroll`, `input`), style, prop and event types, `Native.Host`, `Native.clear`, `Native.setSelection`, and `Native.defineView` for custom native views
- `@effect/ui-native/kit`: native controls and APIs beyond the vocabulary, bundled only when imported
- `NativeHost`: `make`, the `Renderer.Host` that builds Fabric shadow trees and commits them to a surface
- `NativeApp`: `mount`, `mountEffect`, and `register`, which runs an app on every surface native starts; the `Surface` service
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

A release build (`NODE_ENV=production`, as `expo export` and Gradle's release tasks set it) is pre-bundled with Vite, which tree-shakes `effect` and `@effect/ui`, and Metro bundles the result with React Native. Packages with native code or assets are left to Metro: `react-native`, `expo`, and their scoped and prefixed packages by default, and any others named in the `external` option.

Each platform in `platforms` (`["android", "ios"]` by default) gets a pre-bundle using Metro's `sourceExts` and `resolverMainFields`. For each source extension, resolution tries the platform suffix, then `.native`, then no suffix. Platforms without a pre-bundle, such as web, use the sources.

An app's `resolver.resolveRequest` also runs for non-external imports in the pre-bundle:

- Return a source file or an empty module. Put packages that resolve to assets in `external`.
- Delegate to `context.resolveRequest` to let Vite resolve an import, including a renamed import or a changed origin.
- Do not read the delegated result's `filePath` or request another platform. Either fails the release build: Vite resolves asynchronously and only for the build's platform.

In development Metro serves the sources. Editing a module that exports only components swaps them in place and keeps their state; editing any other module reloads the app.

On Android, Back closes the app when nothing handles it. An app that adds handlers with React Native's `BackHandler` takes over that default, as it does in a React app.

React Native doesn't load the `expo` package itself: an app that doesn't import it saves about 1 MB of Hermes bytecode.

## Example

See `examples/native` and its README, which covers the development client, release builds and measuring the bundle. It is an Expo app with a counter, a controlled input, nested text, and a scrolling list. Its `babel.config.cjs` runs TypeScript's type stripper before Expo's, because Metro compiles the workspace's TypeScript sources there and Flow's stripper rejects `declare` class fields.
