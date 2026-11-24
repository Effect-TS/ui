import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as queryCore from "../../internal/queryCore.ts"
import * as Html from "../Html.ts"

/** @internal */
export interface DocumentEnv {
  readonly document: Document
  readonly htmlHost: Context.Service.Shape<typeof Html.Host>
  readonly held: () => boolean
}

/** @internal */
export type Provider = (
  context: Context.Context<any>,
  env: DocumentEnv
) => Context.Context<any>

const providers: Array<Provider> = []

/** @internal */
export const register = (provider: Provider): void => {
  providers.push(provider)
}

/** @internal */
export const Env: Context.Reference<DocumentEnv | undefined> =
  Context.Reference<DocumentEnv | undefined>(
    "@effect/ui/html/internal/DocumentEnv",
    { defaultValue: () => undefined }
  )

const signals = (document: Document) => {
  const visibility = queryCore.makeSignal(document.visibilityState !== "hidden")
  const connectivity = queryCore.makeSignal(true)
  const view = document.defaultView
  const onVisibility = () =>
    visibility.set(document.visibilityState !== "hidden")
  const onOnline = () => connectivity.set(true)
  const onOffline = () => connectivity.set(false)
  document.addEventListener("visibilitychange", onVisibility)
  view?.addEventListener("online", onOnline)
  view?.addEventListener("offline", onOffline)
  return {
    visibility,
    connectivity,
    dispose: () => {
      document.removeEventListener("visibilitychange", onVisibility)
      view?.removeEventListener("online", onOnline)
      view?.removeEventListener("offline", onOffline)
    }
  }
}

const never = () => false

/** @internal */
export const make = (
  document: Document,
  htmlHost: Context.Service.Shape<typeof Html.Host>,
  held: () => boolean = never
) =>
  Effect.suspend(() => {
    const signal = signals(document)
    const env: DocumentEnv = { document, htmlHost, held }
    let context: Context.Context<any> = Context.make(Html.Host, htmlHost).pipe(
      Context.add(queryCore.Visibility, signal.visibility),
      Context.add(queryCore.Connectivity, signal.connectivity),
      Context.add(Env, env)
    )
    for (const provide of providers) context = provide(context, env)
    return Effect.as(
      Effect.addFinalizer(() => Effect.sync(signal.dispose)),
      context
    )
  })
