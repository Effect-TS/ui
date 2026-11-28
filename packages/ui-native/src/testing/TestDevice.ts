/**
 * A fake device for Play tests of a native app, which a test drives in the
 * kit's terms: it presses Back, answers an alert or rotates the screen, and
 * reads what the app asked the device to do.
 *
 * **Details**
 *
 * `layer("android")` or `layer("ios")` provides one value as both
 * `Native.Device`, which the kit's device APIs read, and `TestDevice`, the
 * controls. It acts as that platform wherever the kit tells them apart:
 * native modules, event payloads, and iOS modules that emit only while
 * observed.
 *
 * A control sends its event at once. Run `TestHost.settle`, or a Play step,
 * to see the app's update. An alert, prompt or iOS share sheet the app
 * shows stays open, and in `log`, until the test answers it, as a real one
 * does. Android reports a share as soon as the sheet opens.
 *
 * Nothing in the app imports this module, so it adds nothing to its bundle.
 * Scenes and Stories need no device: Commands and Subscriptions stay data
 * there.
 *
 * **Example** (Back asks before dropping a draft)
 *
 * ```ts import.meta.vitest
 * import { Command, UiSchema } from "@effect/ui"
 * import { Locator, Play, TestHost } from "@effect/ui/testing"
 * import * as Native from "@effect/ui-native/Native"
 * import * as Alert from "@effect/ui-native/kit/Alert"
 * import * as BackHandler from "@effect/ui-native/kit/BackHandler"
 * import { TestDevice } from "@effect/ui-native/testing"
 * import { Effect, Layer, Result, Schema } from "effect"
 *
 * const Message = UiSchema.TaggedEnum({
 *   Typed: { text: Schema.String },
 *   PressedBack: {},
 *   Answered: { discard: Schema.Boolean }
 * })
 *
 * const Draft = Native.component({ name: "Draft", model: Schema.String, message: Message }).make({
 *   init: () => "",
 *   update: {
 *     Typed: (_, { text }) => text,
 *     PressedBack: ($) =>
 *       $.run(
 *         Alert.Alert.make({
 *           title: "Discard the draft?",
 *           buttons: [{ id: "keep", text: "Keep" }, { id: "discard", text: "Discard" }]
 *         }).pipe(Command.map((pressed) =>
 *           Message.Answered({ discard: Result.getOrUndefined(pressed) === "discard" })
 *         ))
 *       ),
 *     Answered: ($, { discard }) => discard ? "" : $.model
 *   },
 *   subscriptions: ({ model }) => [model !== "" && BackHandler.onPress(Message.PressedBack())],
 *   view: (h, text) =>
 *     h.view.children(
 *       h.input.on("input", ({ value }) => Message.Typed({ text: value })),
 *       h.text.children(text === "" ? "Empty" : text)
 *     )
 * })
 *
 * Effect.gen(function*() {
 *   const device = yield* TestDevice.TestDevice
 *   const play = yield* Play.make(Draft, {})
 *   yield* play.fire(Locator.tag("input"), "input", { value: "Hello" })
 *   device.pressBack()
 *   yield* TestHost.settle
 *   device.answerAlert("Discard")
 *   yield* play.expect(Locator.text("Empty")).toExist()
 * }).pipe(
 *   Effect.scoped,
 *   Effect.provide(Layer.merge(TestHost.layer(), TestDevice.layer("android"))),
 *   Effect.runPromise
 * )
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import type * as AccessibilityInfo from "../kit/AccessibilityInfo.ts"
import type * as Alert from "../kit/Alert.ts"
import type * as Appearance from "../kit/Appearance.ts"
import type * as AppState from "../kit/AppState.ts"
import { entry, settings } from "../kit/internal/accessibility.ts"
import { androidButtons, buttonsOf } from "../kit/internal/alert.ts"
import type * as Linking from "../kit/Linking.ts"
import type * as PermissionsAndroid from "../kit/PermissionsAndroid.ts"
import type * as StatusBar from "../kit/StatusBar.ts"
import type * as Native from "../Native.ts"
import { Device } from "../Native.ts"

/**
 * The platform a `TestDevice` acts as.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Platform = "android" | "ios"

/**
 * A window or screen size in points. Without `scale`, it keeps the
 * current one.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Size {
  readonly width: number
  readonly height: number
  readonly scale?: number | undefined
}

/**
 * A button of an open alert or prompt, picked by `id` from the `buttons`
 * the app showed it with. Unlike its text, an `id` tells apart two buttons
 * with the same text.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Choice<
  Buttons extends ReadonlyArray<Alert.Button> = ReadonlyArray<Alert.Button>
> {
  readonly buttons: Buttons
  /** One of `buttons`' ids, or `"ok"` for the button a dialog without any shows. */
  readonly id: Alert.Pressed<
    { readonly title: string; readonly buttons: Buttons }
  >
}

/**
 * Something the app asked the device to do, in the order it asked.
 *
 * **Details**
 *
 * An `Alert`, `Prompt` or `Share` holds what native was given, so an
 * Android alert lists only its last three buttons, and an Android share
 * joins the message and the URL.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Entry =
  | { readonly _tag: "Exit" }
  | { readonly _tag: "OpenURL"; readonly url: string }
  | { readonly _tag: "OpenSettings" }
  | {
    readonly _tag: "SendIntent"
    readonly action: string
    readonly extras?: ReadonlyArray<Linking.Extra> | undefined
  }
  | {
    readonly _tag: "Alert"
    readonly title: string
    readonly message?: string | undefined
    readonly buttons: ReadonlyArray<string>
  }
  | {
    readonly _tag: "Prompt"
    readonly title: string
    readonly message?: string | undefined
    readonly buttons: ReadonlyArray<string>
    readonly type: NonNullable<Alert.PromptOptions["type"]>
    readonly defaultValue?: string | undefined
  }
  | {
    readonly _tag: "Share"
    readonly message?: string | undefined
    readonly url?: string | undefined
    readonly title?: string | undefined
    readonly subject?: string | undefined
    readonly dialogTitle?: string | undefined
  }
  | {
    readonly _tag: "RequestPermissions"
    readonly permissions: ReadonlyArray<PermissionsAndroid.Permission>
  }
  | { readonly _tag: "Vibrate"; readonly duration: number }
  | {
    readonly _tag: "VibratePattern"
    readonly pattern: ReadonlyArray<number>
    readonly repeat: boolean
  }
  | { readonly _tag: "CancelVibration" }
  | { readonly _tag: "StatusBarStyle"; readonly style: StatusBar.Style }
  | { readonly _tag: "StatusBarHidden"; readonly hidden: boolean }
  | {
    readonly _tag: "SetColorScheme"
    readonly colorScheme: Appearance.ColorScheme | "auto"
  }
  | { readonly _tag: "Announce"; readonly announcement: string }

/**
 * The controls of a fake device.
 *
 * **Details**
 *
 * It starts active, light, with the keyboard hidden, a 390 × 844 window at
 * scale 3, no initial URL, every URL openable, every permission denied and
 * every accessibility setting off.
 *
 * @stability experimental
 * @category services
 * @since 0.1.0
 */
export interface TestDevice {
  /**
   * Presses Android's Back. An open alert takes the press and closes if
   * `cancelable`. With no alert or Back handler, the app exits, which `log`
   * records as `Exit`. Throws on iOS.
   */
  readonly pressBack: () => void
  /** Sets the system's colour scheme. An app's `Appearance.setColorScheme` overrides it. */
  readonly setColorScheme: (colorScheme: Appearance.ColorScheme) => void
  readonly setAppState: (state: AppState.State) => void
  /** Warns that memory is low. Throws on Android, which sends no warning. */
  readonly memoryWarning: () => void
  /** Shows the keyboard at the bottom of the screen, `height` points tall. */
  readonly showKeyboard: (height: number) => void
  readonly hideKeyboard: () => void
  /** Resizes the window, and the screen, which is the window's size by default. */
  readonly resize: (window: Size, screen?: Size) => void
  readonly setFontScale: (fontScale: number) => void
  /** Opens the app with `url` while it runs, as a tapped link does. */
  readonly receiveURL: (url: string) => void
  /** Sets the URL the app was launched with. */
  readonly setInitialURL: (url: string | undefined) => void
  /** Sets which URLs `Linking.openURL` and `Linking.canOpenURL` can open. */
  readonly setOpenable: (canOpen: (url: string) => boolean) => void
  /**
   * Presses a button on an open alert: by text on the first one, or by a
   * `Choice` on the first shown with its `buttons`. Throws when there's no
   * such alert or button, or when several buttons have the text.
   */
  readonly answerAlert: <const Buttons extends ReadonlyArray<Alert.Button>>(
    button: string | Choice<Buttons>
  ) => void
  /**
   * Closes the first open alert without a button. Throws when none is open,
   * when it isn't `cancelable`, and on iOS, where only a button closes one.
   */
  readonly dismissAlert: () => void
  /**
   * Enters `text`, and `login` for a `"login-password"` prompt, then
   * presses `button` on an open prompt, as `answerAlert` does.
   */
  readonly answerPrompt: <const Buttons extends ReadonlyArray<Alert.Button>>(
    button: string | Choice<Buttons>,
    text: string,
    login?: string | undefined
  ) => void
  /**
   * Shares from the first open iOS share sheet, reporting `activityType`.
   * Throws on Android, which reports a share once the sheet opens.
   */
  readonly answerShare: (activityType?: string | undefined) => void
  /** Closes the first open share sheet without sharing. Throws on Android. */
  readonly dismissShare: () => void
  /** Sets what `PermissionsAndroid` checks and requests answer for `permission`. */
  readonly setPermission: (
    permission: PermissionsAndroid.Permission,
    status: PermissionsAndroid.Status
  ) => void
  /** Turns an accessibility setting on or off. One the platform lacks stays `false` for the app. */
  readonly setAccessibility: (
    setting: AccessibilityInfo.Setting,
    enabled: boolean
  ) => void
  /** What the app asked the device to do. */
  readonly log: () => ReadonlyArray<Entry>
}

/**
 * The `TestDevice` service.
 *
 * @stability experimental
 * @category services
 * @since 0.1.0
 */
export const TestDevice: Context.Service<TestDevice, TestDevice> = Context
  .Service<TestDevice>("@effect/ui-native/testing/TestDevice")

type Dialog = "Alert" | "Prompt" | "Share"

const labels: Record<Dialog, string> = {
  Alert: "alert",
  Prompt: "prompt",
  Share: "share sheet"
}

// An open alert, prompt or share sheet, with the button texts native got.
interface Open {
  readonly entry: Entry & { readonly _tag: Dialog }
  readonly buttons: ReadonlyArray<string>
  readonly answer: (...args: Array<any>) => void
  readonly dismiss?: (() => void) | undefined
  // Whether the user can close it without a button.
  readonly cancelable?: boolean | undefined
}

type Listener = (payload: any) => void

// Drops the fields native wasn't given.
const defined = <A extends object>(a: A): A =>
  Object.fromEntries(
    Object.entries(a).filter(([, value]) => value !== undefined)
  ) as A

/**
 * Makes a fake device for `platform` and its controls. `layer` provides a
 * new one per build.
 *
 * @stability experimental
 * @category constructors
 * @since 0.1.0
 */
export const make = (platform: Platform): Native.Device & TestDevice => {
  const ios = platform === "ios"
  const listeners = new Map<string, Set<Listener>>()
  const counts = new Map<string, number>()
  const entries: Array<Entry> = []
  const open: Array<Open> = []
  const permissions = new Map<string, PermissionsAndroid.Status>()
  const accessibility = new Map<AccessibilityInfo.Setting, boolean>()
  let scheme: Appearance.ColorScheme = "light"
  let override: Appearance.ColorScheme | undefined
  let appState: AppState.State = "active"
  let window = { width: 390, height: 844, scale: 3 }
  let screen = window
  let fontScale = 1
  let keyboard = false
  let initialURL: string | undefined
  let canOpen = (_url: string) => true

  const log = (entry: Entry) => {
    entries.push(entry)
  }

  // iOS event emitter modules emit only while they have listeners.
  const emit = (event: string, payload?: unknown, emitter?: string) => {
    if (ios && emitter !== undefined && !counts.get(emitter)) return
    for (const listener of Array.from(listeners.get(event) ?? [])) {
      listener(payload)
    }
  }
  const emitter = (name: string) => ({
    addListener: () => counts.set(name, (counts.get(name) ?? 0) + 1),
    removeListeners: (n: number) =>
      counts.set(name, (counts.get(name) ?? 0) - n)
  })

  const colorScheme = () => override ?? scheme
  const setScheme = (
    system: Appearance.ColorScheme,
    app: Appearance.ColorScheme | undefined
  ) => {
    const before = colorScheme()
    scheme = system
    override = app
    if (colorScheme() !== before) {
      emit("appearanceChanged", { colorScheme: colorScheme() }, "Appearance")
    }
  }

  // iOS reports sizes in points, Android in pixels.
  const size = (s: typeof window) =>
    ios
      ? { width: s.width, height: s.height, scale: s.scale, fontScale }
      : {
        width: s.width * s.scale,
        height: s.height * s.scale,
        scale: s.scale,
        fontScale,
        densityDpi: s.scale * 160
      }
  const dimensions = () =>
    ios
      ? { window: size(window), screen: size(screen) }
      : {
        windowPhysicalPixels: size(window),
        screenPhysicalPixels: size(screen)
      }

  // iOS also sends the "will" events.
  const keyboardEvent = (name: "Show" | "Hide", height: number) => {
    const payload = {
      endCoordinates: {
        screenX: 0,
        screenY: screen.height - height,
        width: screen.width,
        height
      },
      duration: ios ? 250 : 0,
      easing: "keyboard"
    }
    if (ios) emit(`keyboardWill${name}`, payload, "KeyboardObserver")
    emit(`keyboardDid${name}`, payload, "KeyboardObserver")
  }
  const hideKeyboard = () => {
    if (!keyboard) return
    keyboard = false
    keyboardEvent("Hide", 0)
  }

  const show = (o: Open) => {
    log(o.entry)
    open.push(o)
  }
  const close = (o: Open | undefined, what: string) => {
    if (o === undefined) throw new Error(`No ${what} is open`)
    open.splice(open.indexOf(o), 1)
    return o
  }
  const take = (tag: Dialog) =>
    close(open.find((o) => o.entry._tag === tag), labels[tag])
  const dismiss = (tag: Dialog, refused: string) => {
    const o = open.find((o) => o.entry._tag === tag)
    if (o !== undefined && !o.cancelable) throw new Error(refused)
    close(o, labels[tag]).dismiss!()
  }
  const sheet = () => {
    if (!ios) throw new Error("Android reports a share once the sheet opens")
  }
  const sameTexts = (a: ReadonlyArray<string>, b: ReadonlyArray<string>) =>
    a.length === b.length && a.every((text, i) => text === b[i])
  // The open dialog `button` picks, and the index of its button there.
  const pick = (tag: "Alert" | "Prompt", button: string | Choice) => {
    const what = labels[tag]
    if (typeof button === "string") {
      const o = open.find((o) => o.entry._tag === tag)
      const index = o?.buttons.indexOf(button) ?? -1
      if (o !== undefined && index < 0) {
        throw new Error(
          `The ${what} has no button "${button}", only ${
            JSON.stringify(o.buttons)
          }`
        )
      }
      if (o !== undefined && o.buttons.lastIndexOf(button) !== index) {
        throw new Error(
          `The ${what} has several "${button}" buttons: pick one by id`
        )
      }
      return [close(o, what), index] as const
    }
    // The buttons in the order native got them.
    const buttons = buttonsOf(button.buttons)
    const shown = ios
      ? buttons
      : androidButtons(buttons).filter((b) => b !== undefined)
    const texts = shown.map((b) => b.text)
    const o = open.find((o) =>
      o.entry._tag === tag && sameTexts(o.buttons, texts)
    )
    const index = shown.findIndex((b) => b.id === button.id)
    if (o !== undefined && index < 0) {
      throw new Error(
        buttons.some((b) => b.id === button.id)
          ? `Android shows only the last three buttons, not "${button.id}"`
          : `The ${what} has no button with id "${button.id}"`
      )
    }
    return [close(o, `${what} with ${JSON.stringify(texts)}`), index] as const
  }
  const press = (
    tag: "Alert" | "Prompt",
    button: string | Choice,
    text?: string,
    login?: string
  ) => {
    const [o, index] = pick(tag, button)
    o.answer(index, text, login)
  }

  const status = (permission: string) => permissions.get(permission) ?? "denied"
  const enabled = (setting: AccessibilityInfo.Setting) =>
    accessibility.get(setting) ?? false
  const getters = (
    answer: (setting: AccessibilityInfo.Setting, args: Array<any>) => void
  ) =>
    Object.fromEntries(
      (Object.keys(settings) as Array<AccessibilityInfo.Setting>).flatMap(
        (setting) => {
          const getter = entry(platform, setting)?.[0]
          return getter === undefined
            ? []
            : [[getter, (...args: Array<any>) => answer(setting, args)]]
        }
      )
    )
  const announce = (announcement: string) =>
    log({ _tag: "Announce", announcement })
  const vibrate = (duration: number) => log({ _tag: "Vibrate", duration })

  const linking = {
    openURL: async (url: string) => {
      log({ _tag: "OpenURL", url })
      if (!canOpen(url)) throw new Error(`No app opens ${url}`)
      return true
    },
    canOpenURL: async (url: string) => canOpen(url),
    getInitialURL: async () => initialURL ?? null,
    openSettings: async () => {
      log({ _tag: "OpenSettings" })
    }
  }

  const shared: Record<string, unknown> = {
    Appearance: {
      getColorScheme: colorScheme,
      setColorScheme: (value: Appearance.ColorScheme | "auto") => {
        log({ _tag: "SetColorScheme", colorScheme: value })
        setScheme(scheme, value === "auto" ? undefined : value)
      },
      ...emitter("Appearance")
    },
    AppState: {
      getConstants: () => ({ initialAppState: appState }),
      getCurrentAppState: (
        success: (e: { app_state: AppState.State }) => void
      ) => success({ app_state: appState }),
      ...emitter("AppState")
    },
    DeviceInfo: { getConstants: () => ({ Dimensions: dimensions() }) },
    KeyboardObserver: emitter("KeyboardObserver"),
    StatusBarManager: {
      getConstants: () => ({}),
      setStyle: (style: StatusBar.Style) =>
        log({ _tag: "StatusBarStyle", style }),
      setHidden: (hidden: boolean) => log({ _tag: "StatusBarHidden", hidden })
    }
  }

  const modules: Record<string, unknown> = ios
    ? {
      ...shared,
      AccessibilityManager: {
        ...getters((setting, [success]) => success(enabled(setting))),
        announceForAccessibility: announce,
        announceForAccessibilityWithOptions: announce
      },
      ActionSheetManager: {
        showShareActionSheetWithOptions: (
          options: { message?: string; url?: string; subject?: string },
          _failure: unknown,
          success: (completed: boolean, activityType: string | null) => void
        ) =>
          show({
            entry: defined({
              _tag: "Share",
              message: options.message,
              url: options.url,
              subject: options.subject
            }),
            buttons: [],
            answer: (activityType?: string) =>
              success(true, activityType ?? null),
            dismiss: () => success(false, null),
            cancelable: true
          })
      },
      AlertManager: {
        alertWithArgs: (
          args: {
            title: string
            message?: string
            buttons: ReadonlyArray<Record<string, string>>
            type?: NonNullable<Alert.PromptOptions["type"]>
            defaultValue?: string
          },
          callback: (index: string, value: unknown) => void
        ) => {
          const buttons = args.buttons.map((button) => Object.values(button)[0])
          const { type } = args
          show({
            entry: defined({
              _tag: type === undefined ? "Alert" : "Prompt",
              title: args.title,
              message: args.message,
              buttons,
              type,
              defaultValue: args.defaultValue
            }) as Open["entry"],
            buttons,
            answer: (index: number, text = "", login?: string) =>
              callback(
                String(index),
                type === "login-password"
                  ? { login: login ?? "", password: text }
                  : text
              )
          })
        }
      },
      LinkingManager: { ...linking, ...emitter("LinkingManager") },
      Vibration: { vibrate }
    }
    : {
      ...shared,
      AccessibilityInfo: {
        // Android's bridge rejects a call with another number of arguments.
        ...getters((setting, args) => {
          if (args.length !== 1) {
            throw new Error(`Takes 1 argument, got ${args.length}`)
          }
          args[0](enabled(setting))
        }),
        announceForAccessibility: announce,
        getRecommendedTimeoutMillis: (
          ms: number,
          success: (ms: number) => void
        ) => success(ms)
      },
      DeviceEventManager: {
        invokeDefaultBackPressHandler: () => log({ _tag: "Exit" })
      },
      DialogManagerAndroid: {
        getConstants: () => ({
          buttonClicked: "buttonClicked",
          dismissed: "dismissed",
          buttonPositive: -1,
          buttonNegative: -2,
          buttonNeutral: -3
        }),
        showAlert: (
          config: {
            title: string
            message?: string
            cancelable?: boolean
            buttonPositive?: string
            buttonNegative?: string
            buttonNeutral?: string
          },
          _onError: unknown,
          onAction: (action: string, key?: number) => void
        ) => {
          const keys = ([
            [config.buttonNeutral, -3],
            [config.buttonNegative, -2],
            [config.buttonPositive, -1]
          ] as const).filter(([text]) => text !== undefined)
          const buttons = keys.map(([text]) => text!)
          // Showing an alert dismisses the one already shown.
          for (const o of open.slice()) close(o, "alert").dismiss!()
          show({
            entry: defined({
              _tag: "Alert",
              title: config.title,
              message: config.message || undefined,
              buttons
            }),
            buttons,
            answer: (index: number) =>
              onAction("buttonClicked", keys[index][1]),
            dismiss: () => onAction("dismissed"),
            cancelable: config.cancelable
          })
        }
      },
      IntentAndroid: {
        ...linking,
        sendIntent: async (
          action: string,
          extras?: ReadonlyArray<Linking.Extra>
        ) => {
          log(defined({ _tag: "SendIntent", action, extras }))
        }
      },
      PermissionsAndroid: {
        checkPermission: async (permission: string) =>
          status(permission) === "granted",
        shouldShowRequestPermissionRationale: async () => false,
        requestPermission: async (
          permission: PermissionsAndroid.Permission
        ) => {
          log({ _tag: "RequestPermissions", permissions: [permission] })
          return status(permission)
        },
        requestMultiplePermissions: async (
          list: ReadonlyArray<PermissionsAndroid.Permission>
        ) => {
          log({ _tag: "RequestPermissions", permissions: list })
          return Object.fromEntries(list.map((p) => [p, status(p)]))
        }
      },
      ShareModule: {
        share: (
          content: { title?: string; message?: string },
          dialogTitle?: string
        ) => {
          // Android reports a share as soon as the sheet opens.
          log(defined({
            _tag: "Share",
            title: content.title,
            message: content.message,
            dialogTitle
          }))
          return Promise.resolve({ action: "sharedAction" })
        }
      },
      Vibration: {
        vibrate,
        vibrateByPattern: (pattern: ReadonlyArray<number>, repeat: number) =>
          log({ _tag: "VibratePattern", pattern, repeat: repeat >= 0 }),
        cancel: () => log({ _tag: "CancelVibration" })
      }
    }

  return {
    os: platform,
    on: (event, listener) => {
      let set = listeners.get(event)
      if (set === undefined) listeners.set(event, set = new Set())
      // A copy, so the same listener can listen twice.
      const own: Listener = (payload) => listener(payload)
      set.add(own)
      return () => {
        set.delete(own)
      }
    },
    module: (name) => modules[name],
    blur: hideKeyboard,
    color: (color) => color,

    pressBack: () => {
      if (ios) throw new Error("iOS has no Back button")
      if (open.length > 0) {
        if (open[0].cancelable) close(open[0], "alert").dismiss!()
      } else if (listeners.get("hardwareBackPress")?.size) {
        emit("hardwareBackPress")
      } else {
        log({ _tag: "Exit" })
      }
    },
    setColorScheme: (value) => setScheme(value, override),
    setAppState: (state) => {
      if (state === appState) return
      appState = state
      emit("appStateDidChange", { app_state: state }, "AppState")
    },
    memoryWarning: () => {
      if (!ios) throw new Error("Android sends no memory warning")
      emit("memoryWarning", undefined, "AppState")
    },
    showKeyboard: (height) => {
      keyboard = true
      keyboardEvent("Show", height)
    },
    hideKeyboard,
    resize: (w, s = w) => {
      window = {
        width: w.width,
        height: w.height,
        scale: w.scale ?? window.scale
      }
      screen = {
        width: s.width,
        height: s.height,
        scale: s.scale ?? screen.scale
      }
      emit("didUpdateDimensions", dimensions())
    },
    setFontScale: (value) => {
      fontScale = value
      emit("didUpdateDimensions", dimensions())
    },
    receiveURL: (url) => emit("url", { url }, "LinkingManager"),
    setInitialURL: (url) => {
      initialURL = url
    },
    setOpenable: (f) => {
      canOpen = f
    },
    answerAlert: (button) => press("Alert", button),
    dismissAlert: () =>
      dismiss(
        "Alert",
        ios
          ? "An iOS alert closes only with a button"
          : "The alert isn't cancelable"
      ),
    answerPrompt: (button, text, login) => press("Prompt", button, text, login),
    answerShare: (activityType) => {
      sheet()
      take("Share").answer(activityType)
    },
    dismissShare: () => {
      sheet()
      dismiss("Share", "The share sheet can't be dismissed")
    },
    setPermission: (permission, value) => {
      permissions.set(permission, value)
    },
    setAccessibility: (setting, value) => {
      if (value === enabled(setting)) return
      accessibility.set(setting, value)
      const event = entry(platform, setting)?.[1]
      if (event !== undefined) emit(event, value)
    },
    log: () => entries.slice()
  }
}

/**
 * Provides a fake device for `platform` as `Native.Device`, with its
 * controls, `TestDevice`.
 *
 * @stability experimental
 * @category layers
 * @since 0.1.0
 */
export const layer = (platform: Platform): Layer.Layer<TestDevice> =>
  Layer.effectContext(
    Effect.sync(() => {
      const device = make(platform)
      return Context.make(TestDevice, device).pipe(
        Context.add(Device, device)
      )
    })
  )
