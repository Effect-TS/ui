# Native example

An Expo app built with `@effect/ui-native`: a counter, a controlled name input that Reset clears, nested text, and a scrolling list. The list's sticky header follows the scroll on the native driver, and new rows fade in with `LayoutAnimation`. It has no React components of its own; React Native's renderer is replaced by `NativeApp.register` in `src/main.ts`.

The commands below run from this directory after `pnpm install` at the repository root, with the Android SDK and a JDK installed. The `android` and `ios` directories are generated and not committed.

## Development

Build and install the development client, then start Metro:

```sh
pnpm android        # expo run:android: generates android/, builds a debug APK, installs it and starts Metro
```

Once the client is installed, Metro can be started on its own and the client pointed at it:

```sh
pnpm start
adb reverse tcp:8081 tcp:8081
adb shell am start -a android.intent.action.VIEW \
  -d "exp+effect-ui-native://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081" \
  dev.effect.ui.example
```

Metro serves the TypeScript sources of this app and of the workspace packages. Editing a module that exports only components, such as `src/App.ts`, swaps them in place and keeps their state. Other edits reload the app.

## Release build

A release build is pre-bundled with Vite, once per platform, and Metro bundles the result with React Native:

```sh
pnpm prebuild --platform android
cd android
./gradlew assembleRelease
```

The APK is `android/app/build/outputs/apk/release/app-release.apk`. Add `-PreactNativeArchitectures=x86_64` (or `arm64-v8a`) to build for one ABI only.

Gradle bundles again only when the bundle task's inputs change, and React Native's inputs stop at this directory. `plugins/withWorkspaceSources.cjs`, listed in `app.json`, adds the sources of the workspace packages the app links (`packages/ui` and `packages/ui-native`), so editing one of them is enough for the next `assembleRelease` to ship it. Run `pnpm prebuild` again after linking another workspace package.

## Pointer events

`plugins/withPointerEvents.cjs` turns on React Native's W3C pointer events in the generated `AppDelegate.swift` and `MainApplication.kt`, which both platforms leave off. The main screen shows the last pointer event under the item list, and a list item shows "hovering" while a mouse or stylus is over it. To check them, connect a mouse to an Android device, or use an iPad with a trackpad or Apple Pencil, then:

- Move the pointer over the screen without pressing: the line reads `mouse move` (or `pen move`) with the position.
- Press and release on a button: `down`, `up` and `click` follow, even though the button's text is the view native hits.
- Add an item and move over it: "hovering Item 1" shows, and goes when the pointer leaves the row.

## Measuring the bundle

The Hermes bytecode an Android release ships is `assets/index.android.bundle` in the APK:

```sh
unzip -p android/app/build/outputs/apk/release/app-release.apk assets/index.android.bundle | wc -c
```

The JavaScript it is compiled from, and its gzip size:

```sh
npx expo export --platform android --no-bytecode --output-dir dist/js
gzip -9c dist/js/_expo/static/js/android/*.js | wc -c
```

`npx expo export --platform android` also produces Hermes bytecode, but it is not the size the APK ships. Gradle compiles with `-output-source-map`, which moves the line and column tables into a separate `.map` file; `expo export` keeps them in the `.hbc`, which makes it about 140 KB larger for this app.
