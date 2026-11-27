/**
 * The system's share sheet.
 *
 * **Details**
 *
 * `share` opens the sheet with a message, a URL or both, and succeeds once
 * it closes, with whether something was shared. `Share` is its Command.
 *
 * **Gotchas**
 *
 * - Android shares text only, so it gets `url` after `message`, and
 *   `title` as the subject. It reports `"shared"` once the sheet opens,
 *   whether or not the user then shares.
 * - `dialogTitle` is Android's, and `subject`, `excludedActivityTypes` and
 *   `tintColor` are iOS's.
 *
 * **Example** (Sharing a link)
 *
 * ```ts
 * import { Share } from "@effect/ui-native/kit"
 * import { Effect } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const shared = yield* Share.share({ message: "Effect", url: "https://effect.website" })
 *   if (shared.action === "shared") yield* Effect.log(shared.activityType)
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
 * What `share` shares, which needs a `message`, a `url` or both, and how
 * the sheet looks.
 *
 * **Details**
 *
 * - `title`: Android's subject, such as an email's.
 * - `dialogTitle`: the title of Android's sheet.
 * - `subject`: iOS's subject, such as an email's.
 * - `excludedActivityTypes`: iOS activities to leave out, such as
 *   `"com.apple.UIKit.activity.Print"`.
 * - `tintColor`: the colour of iOS's sheet.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Options {
  readonly message?: string | undefined
  readonly url?: string | undefined
  readonly title?: string | undefined
  readonly dialogTitle?: string | undefined
  readonly subject?: string | undefined
  readonly excludedActivityTypes?: ReadonlyArray<string> | undefined
  readonly tintColor?: Native.Color | undefined
}

/**
 * How the share sheet closed: `"shared"`, with the iOS activity chosen, or
 * `"dismissed"`.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Shared =
  | { readonly action: "shared"; readonly activityType: string | undefined }
  | { readonly action: "dismissed" }

const dismissed: Shared = { action: "dismissed" }

/**
 * Opens the share sheet, and succeeds once it closes.
 *
 * @stability experimental
 * @category actions
 * @since 0.1.0
 */
export const share = (
  options: Options
): Effect.Effect<Shared, Native.DeviceError> =>
  Native.Device.use((d): Effect.Effect<Shared, Native.DeviceError> =>
    d.os === "android"
      ? Effect.map(
        device.promise<{ action: string }>(
          "ShareModule",
          "share",
          (module) =>
            module?.share(
              {
                title: options.title,
                message: [options.message, options.url].filter(Boolean).join(
                  " "
                )
              },
              options.dialogTitle
            )
        ),
        (result): Shared =>
          result.action === "dismissedAction"
            ? dismissed
            : { action: "shared", activityType: undefined }
      )
      : device.callback<Shared>(
        "ActionSheetManager",
        "showShareActionSheetWithOptions",
        (module, resolve, reject) =>
          module.showShareActionSheetWithOptions(
            {
              message: options.message,
              url: options.url,
              subject: options.subject,
              excludedActivityTypes: options.excludedActivityTypes,
              tintColor: options.tintColor === undefined
                ? undefined
                : d.color(options.tintColor)
            },
            reject,
            (completed: boolean, activityType: string | null) =>
              resolve(
                completed
                  ? {
                    action: "shared",
                    activityType: activityType ?? undefined
                  }
                  : dismissed
              )
          )
      )
  )

/**
 * The Command behind `share`. Its `tintColor` is a colour string or number,
 * which a story can compare.
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const Share: Command.Factory<
  Options & { readonly tintColor?: string | number | undefined },
  Result.Result<Shared, Native.DeviceError>
> = Command.make(
  "Share.share",
  {
    args: {
      message: Schema.optional(Schema.String),
      url: Schema.optional(Schema.String),
      title: Schema.optional(Schema.String),
      dialogTitle: Schema.optional(Schema.String),
      subject: Schema.optional(Schema.String),
      excludedActivityTypes: Schema.optional(Schema.Array(Schema.String)),
      tintColor: Schema.optional(Schema.Union([Schema.String, Schema.Number]))
    }
  },
  (options) => device.result(share(options))
)
