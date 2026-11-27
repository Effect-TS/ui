/**
 * The system's alert dialogs.
 *
 * **Details**
 *
 * `alert` shows a dialog and succeeds with the `id` of the button pressed,
 * or `undefined` when it's dismissed without one. `prompt` shows an iOS
 * dialog with text fields, and succeeds with the button and the text
 * entered. `Alert` and `Prompt` are their Commands.
 *
 * With no `buttons`, or an empty list, the dialog has one,
 * `{ id: "ok", text: "OK" }`. So the result's type includes `"ok"` unless
 * the options' type requires `buttons` with at least one button.
 *
 * **Gotchas**
 *
 * - Android shows at most three buttons: the last is the positive one, the
 *   one before it the negative one, and the one before that the neutral one.
 *   Android ignores `style` and `preferred`.
 * - iOS ignores `cancelable`: an alert closes only with a button.
 * - Interrupting `alert` doesn't close the dialog. Its button then does
 *   nothing.
 *
 * **Example** (Confirming a delete)
 *
 * ```ts
 * import * as Native from "@effect/ui-native/Native"
 * import { Alert } from "@effect/ui-native/kit"
 * import { Command, UiSchema } from "@effect/ui"
 * import { Result, Schema } from "effect"
 *
 * const Message = UiSchema.TaggedEnum({ PressedDelete: {}, Confirmed: {} })
 *
 * const Note = Native.component({
 *   name: "Note",
 *   model: Schema.Struct({ deleted: Schema.Boolean }),
 *   message: Message
 * }).make({
 *   init: () => ({ deleted: false }),
 *   update: {
 *     PressedDelete: ($) =>
 *       $.run(
 *         Alert.Alert.make({
 *           title: "Delete this note?",
 *           buttons: [
 *             { id: "cancel", text: "Cancel", style: "cancel" },
 *             { id: "delete", text: "Delete", style: "destructive" }
 *           ]
 *         }).pipe(Command.map((pressed) =>
 *           Result.getOrUndefined(pressed) === "delete" ? Message.Confirmed() : undefined
 *         ))
 *       ),
 *     Confirmed: ($) => $.set({ deleted: true })
 *   },
 *   view: (h) => h.view.on("press", Message.PressedDelete()).children(h.text.children("Delete"))
 * })
 * ```
 *
 * @stability experimental
 * @since 0.1.0
 */
import * as Command from "@effect/ui/Command"
import * as Effect from "effect/Effect"
import type * as Result from "effect/Result"
import * as Schema from "effect/Schema"
import * as Native from "../Native.ts"
import * as device from "./internal/device.ts"

/**
 * A dialog's button. `id` is what `alert` succeeds with when it's pressed.
 *
 * **Details**
 *
 * On iOS, `style` `"cancel"` places the button where iOS puts the one that
 * cancels, `"destructive"` shows it in red, and `preferred` makes it the
 * one Return presses.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Button<Id extends string = string> {
  readonly id: Id
  readonly text: string
  readonly style?: "default" | "cancel" | "destructive" | undefined
  readonly preferred?: boolean | undefined
}

/**
 * The options of `alert`.
 *
 * **Details**
 *
 * `cancelable` lets an Android dialog close with Back or a tap outside it,
 * and `userInterfaceStyle` sets an iOS dialog's colour scheme.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Options<
  Buttons extends ReadonlyArray<Button> = ReadonlyArray<Button>
> {
  readonly title: string
  readonly message?: string | undefined
  readonly buttons?: Buttons | undefined
  readonly cancelable?: boolean | undefined
  readonly userInterfaceStyle?: "light" | "dark" | undefined
}

/**
 * The `id`s a dialog shown with `O` can answer with: its buttons', and
 * `"ok"` unless `O` requires `buttons` with at least one button.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Pressed<O extends Options> =
  | (O extends { readonly buttons?: infer Buttons }
    ? Buttons extends ReadonlyArray<Button> ? Buttons[number]["id"] : never
    : never)
  | (O extends { readonly buttons: readonly [Button, ...ReadonlyArray<Button>] }
    ? never
    : "ok")

const ok: ReadonlyArray<Button> = [{ id: "ok", text: "OK" }]

// No buttons, or an empty list, gives the one OK button.
const buttonsOf = (
  buttons: ReadonlyArray<Button> | undefined
): ReadonlyArray<Button> => buttons?.length ? buttons : ok

// iOS's dialog, which answers with the index of the button pressed and the
// text fields' values.
const ios = (
  options: Options & {
    readonly type?: string | undefined
    readonly defaultValue?: string | undefined
    readonly keyboardType?: string | undefined
  },
  buttons: ReadonlyArray<Button>
) =>
  device.callback<readonly [Button, unknown]>(
    "AlertManager",
    "alertWithArgs",
    (module, resolve) => {
      const key = (f: (button: Button) => unknown) => {
        const index = buttons.findIndex(f)
        return index < 0 ? undefined : String(index)
      }
      module.alertWithArgs(
        {
          title: options.title,
          message: options.message,
          buttons: buttons.map((button, i) => ({ [i]: button.text })),
          type: options.type,
          defaultValue: options.defaultValue,
          keyboardType: options.keyboardType,
          cancelButtonKey: key((b) => b.style === "cancel"),
          destructiveButtonKey: key((b) => b.style === "destructive"),
          preferredButtonKey: key((b) => b.preferred),
          userInterfaceStyle: options.userInterfaceStyle
        },
        (index: string, value: unknown) =>
          resolve([buttons[Number(index)], value])
      )
    }
  )

const android = (options: Options, buttons: ReadonlyArray<Button>) =>
  device.callback<string | undefined>(
    "DialogManagerAndroid",
    "showAlert",
    (module, resolve, reject) => {
      const constants = module.getConstants()
      const [neutral, negative, positive] = [
        undefined,
        undefined,
        ...buttons.slice(-3)
      ].slice(-3)
      module.showAlert(
        {
          title: options.title,
          message: options.message ?? "",
          cancelable: options.cancelable ?? false,
          buttonPositive: positive?.text,
          buttonNegative: negative?.text,
          buttonNeutral: neutral?.text
        },
        (message: string) => reject(new Error(message)),
        (action: string, key: number) =>
          resolve(
            action !== constants.buttonClicked
              ? undefined
              : key === constants.buttonPositive
              ? positive?.id
              : key === constants.buttonNegative
              ? negative?.id
              : neutral?.id
          )
      )
    }
  )

/**
 * Shows a dialog, and succeeds with the `id` of the button pressed, or
 * `undefined` when it's dismissed without one.
 *
 * @stability experimental
 * @category actions
 * @since 0.1.0
 */
export const alert = <const O extends Options>(
  options: O
): Effect.Effect<Pressed<O> | undefined, Native.DeviceError> =>
  Native.Device.use((d) => {
    const buttons = buttonsOf(options.buttons)
    return (d.os === "android"
      ? android(options, buttons)
      : Effect.map(
        ios(options, buttons),
        ([button]) => button?.id
      )) as any
  })

/**
 * The options of `prompt`.
 *
 * **Details**
 *
 * `type` sets the text fields: one in `"plain-text"`, the default, one
 * that hides what's typed in `"secure-text"`, and a login and a password in
 * `"login-password"`. `defaultValue` fills the first field, and
 * `keyboardType` is its `input`'s.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface PromptOptions<
  Buttons extends ReadonlyArray<Button> = ReadonlyArray<Button>
> extends Omit<Options<Buttons>, "cancelable"> {
  readonly type?: "plain-text" | "secure-text" | "login-password" | undefined
  readonly defaultValue?: string | undefined
  readonly keyboardType?: string | undefined
}

/**
 * What `prompt` succeeds with: the button pressed, and the text entered.
 * `login` is set for the `"login-password"` type.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Prompted<Id extends string = string> {
  readonly id: Id
  readonly text: string
  readonly login?: string | undefined
}

/**
 * Shows an iOS dialog with text fields, and succeeds with the button
 * pressed and the text entered. Fails off iOS.
 *
 * @stability experimental
 * @category actions
 * @since 0.1.0
 */
export const prompt = <const O extends PromptOptions>(
  options: O
): Effect.Effect<Prompted<Pressed<O>>, Native.DeviceError> =>
  Effect.map(
    ios(
      { ...options, type: options.type ?? "plain-text" },
      buttonsOf(options.buttons)
    ),
    ([button, value]: readonly [Button, any]) =>
      typeof value === "object" && value !== null
        ? {
          id: button.id as Pressed<O>,
          text: value.password ?? "",
          login: value.login
        }
        : { id: button.id as Pressed<O>, text: value ?? "" }
  )

const ButtonSchema = Schema.Struct({
  id: Schema.String,
  text: Schema.String,
  style: Schema.optional(Schema.Literals(["default", "cancel", "destructive"])),
  preferred: Schema.optional(Schema.Boolean)
})

const options = {
  title: Schema.String,
  message: Schema.optional(Schema.String),
  buttons: Schema.optional(Schema.Array(ButtonSchema)),
  userInterfaceStyle: Schema.optional(Schema.Literals(["light", "dark"]))
}

/**
 * The Command behind `alert`. Its result is the `id` of the button
 * pressed.
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const Alert: Command.Factory<
  Options,
  Result.Result<string | undefined, Native.DeviceError>
> = Command.make(
  "Alert.alert",
  { args: { ...options, cancelable: Schema.optional(Schema.Boolean) } },
  (options) => Effect.result(alert(options))
)

/**
 * The Command behind `prompt`.
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const Prompt: Command.Factory<
  PromptOptions,
  Result.Result<Prompted, Native.DeviceError>
> = Command.make(
  "Alert.prompt",
  {
    args: {
      ...options,
      type: Schema.optional(
        Schema.Literals(["plain-text", "secure-text", "login-password"])
      ),
      defaultValue: Schema.optional(Schema.String),
      keyboardType: Schema.optional(Schema.String)
    }
  },
  (options) => Effect.result(prompt(options))
)
