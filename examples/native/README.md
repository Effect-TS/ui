# Native example

An Expo app built with `@effect/ui-native`: a counter, a controlled name input that Reset clears, nested text, and a scrolling list. It has no React components of its own; React Native's renderer is replaced by `NativeApp.register` in `src/main.ts`.

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

Gradle decides whether to bundle again from the `.ts` and `.js` files in this directory, outside `node_modules`. After changing a workspace package, delete the previous bundle so the next build makes a new one:

```sh
rm -rf android/app/build/generated/assets/react
```

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
