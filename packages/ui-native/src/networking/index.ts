/**
 * Installs React Native's networking globals (`fetch`, `XMLHttpRequest`,
 * `WebSocket`, `URL`, `AbortController`, and related classes).
 *
 * **Details**
 *
 * Import this module for its side effects in the app's entry module when the
 * app makes network requests. It is opt-in so apps that do not make requests
 * do not pay the bundle cost of React Native's XHR stack.
 *
 * **Example** (Enabling networking in the entry module)
 *
 * ```ts
 * import "@effect/ui-native/networking"
 * import { NativeApp } from "@effect/ui-native"
 * import { App } from "./App.ts"
 *
 * NativeApp.register(NativeApp.mount(App, {}))
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as setUpXHR from "react-native/Libraries/Core/setUpXHR"

void setUpXHR
