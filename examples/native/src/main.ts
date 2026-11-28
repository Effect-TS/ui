// The app's entry, in place of Expo's `registerRootComponent`. It mounts
// `App` on each surface native starts, with no React in the bundle.
import * as NativeApp from "@effect/ui-native/NativeApp"
import * as NativeRouter from "@effect/ui-native/NativeRouter"
import * as Layer from "effect/Layer"
import { App } from "./App.ts"
import { AppRoute } from "./routes.ts"

NativeApp.register(
  NativeApp.mount(App, NativeRouter.props(AppRoute)).pipe(
    Layer.provide(
      NativeRouter.layer({ routes: AppRoute, prefixes: ["effect-ui://"] })
    )
  )
)
