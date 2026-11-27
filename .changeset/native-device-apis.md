---
"@effect/ui-native": minor
---

Add React Native's device APIs to `@effect/ui-native/kit`, calling native modules directly: `AccessibilityInfo`, `Alert`, `AppState`, `Appearance`, `BackHandler`, `Dimensions`, `I18nManager`, `Keyboard`, `Linking`, `PermissionsAndroid`, `PlatformColor`, `Share`, `StatusBar` and `Vibration`, and the `KeyboardAvoidingView` component. They read the device from the new `Native.Device` service, which `NativeApp.register` provides.

`NativeApp`'s `Surface` now follows native's updates to a surface's props: `Surface.initialProps` is renamed `props` and gains `onProps`, and `mount` re-runs an Effect `props` when they change.
