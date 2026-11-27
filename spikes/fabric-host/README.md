# Fabric host spike

A throwaway spike for EFF-4477. It runs an `@effect/ui` root on React
Native's Fabric renderer, with no React, from a stock Expo project
(`create-expo-app --template blank-typescript`). The vocabulary in
`src/Spike.ts` is deliberately minimal and is not a proposal.

## Layout

- `src/FabricHost.ts` is a `Renderer.Host` over `nativeFabricUIManager`.
- `src/main.ts` installs `RN$AppRegistry` so native can start a surface
  without React's `AppRegistry`. It also installs the globals native expects
  that React Native's `InitializeCore` would otherwise set up.
- `src/Counter.ts` and `src/Bench.ts` are the two apps, booted by
  `src/main-counter.ts` and `src/main-bench.ts`.
  `src/react/main.tsx` is the same benchmark in stock React Native.
  `src/Moves.ts` is a device check, not a measured app: it moves a kept
  text between a text, a scroll view and a view, and hides it.
- `index.ts` picks a variant from `EXPO_PUBLIC_*` variables, which are
  inlined at build time:
  - `EXPO_PUBLIC_SPIKE=counter|bench|moves|react-bench|react-template` selects
    the app.
  - `EXPO_PUBLIC_SPIKE_PREBUILT=1` loads `prebuilt/<app>.cjs`, a
    tree-shaken Vite pre-bundle, instead of letting Metro bundle the sources.
  - `EXPO_PUBLIC_SPIKE_EXPO=1` also loads the `expo` package.

## Running

Run `pnpm install` at the repository root first, because Metro resolves
`@effect/ui` and `effect` from the workspace. Then:

```sh
npm install
for s in counter bench; do
  EXPO_PUBLIC_SPIKE=$s ../../node_modules/.bin/vite build --config scripts/prebundle.config.mjs
done
CI=1 npx expo prebuild --platform android --no-install
cd android && EXPO_PUBLIC_SPIKE=counter EXPO_PUBLIC_SPIKE_PREBUILT=1 ./gradlew assembleRelease
```

The Gradle bundle task does not treat environment variables as inputs. When
switching variants, delete `android/app/build/generated/assets/react`
first, or Gradle reuses the previous bundle.

The release apps log `SPIKE_STARTUP` and `SPIKE_BENCH` to logcat under
`ReactNativeJS`.

To measure bundle size, run `scripts/measure.sh <name> ENV=value...`, which
exports into `dist/<name>` and `dist/<name>-js`. To see where the bytes in a
bundle go, run `scripts/breakdown.cjs <bundle.js> <bundle.map>`.

To run the unit tests against a fake Fabric:

```sh
../../node_modules/.bin/vitest run --root .
```
