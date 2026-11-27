/**
 * Android's runtime permissions.
 *
 * **Details**
 *
 * `check` reads whether the app holds a permission, and `request` asks the
 * user for it, first explaining why with a `Rationale` when Android
 * suggests it. `requestMultiple` asks for several at once. `Check`,
 * `Request` and `RequestMultiple` are their Commands.
 *
 * Off Android the app holds no permission: `check` is `false`, and a
 * request answers `"denied"`.
 *
 * **Gotchas**
 *
 * - The app's manifest has to declare a permission with
 *   `<uses-permission>` for a request to show a dialog. Without it, the
 *   request answers `"denied"`.
 * - Once the user denies a permission twice, Android stops asking and
 *   answers `"never_ask_again"`. Only the app's settings, which
 *   `Linking.openSettings` opens, can grant it then.
 *
 * **Example** (Asking for the camera)
 *
 * ```ts
 * import { PermissionsAndroid } from "@effect/ui-native/kit"
 * import { Effect } from "effect"
 *
 * const canUseCamera = PermissionsAndroid.request("android.permission.CAMERA", {
 *   title: "Camera",
 *   message: "Scanning a code needs the camera.",
 *   buttonPositive: "OK"
 * }).pipe(Effect.map((status) => status === "granted"))
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
 * A permission the app asks for while it runs.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Permission =
  | "android.permission.ACCEPT_HANDOVER"
  | "android.permission.ACCESS_BACKGROUND_LOCATION"
  | "android.permission.ACCESS_COARSE_LOCATION"
  | "android.permission.ACCESS_FINE_LOCATION"
  | "android.permission.ACCESS_LOCAL_NETWORK"
  | "android.permission.ACCESS_MEDIA_LOCATION"
  | "android.permission.ACTIVITY_RECOGNITION"
  | "android.permission.ANSWER_PHONE_CALLS"
  | "android.permission.BLUETOOTH_ADVERTISE"
  | "android.permission.BLUETOOTH_CONNECT"
  | "android.permission.BLUETOOTH_SCAN"
  | "android.permission.BODY_SENSORS"
  | "android.permission.BODY_SENSORS_BACKGROUND"
  | "android.permission.CALL_PHONE"
  | "android.permission.CAMERA"
  | "android.permission.GET_ACCOUNTS"
  | "android.permission.NEARBY_WIFI_DEVICES"
  | "android.permission.POST_NOTIFICATIONS"
  | "android.permission.PROCESS_OUTGOING_CALLS"
  | "android.permission.READ_CALENDAR"
  | "android.permission.READ_CALL_LOG"
  | "android.permission.READ_CONTACTS"
  | "android.permission.READ_EXTERNAL_STORAGE"
  | "android.permission.READ_MEDIA_AUDIO"
  | "android.permission.READ_MEDIA_IMAGES"
  | "android.permission.READ_MEDIA_VIDEO"
  | "android.permission.READ_MEDIA_VISUAL_USER_SELECTED"
  | "android.permission.READ_PHONE_NUMBERS"
  | "android.permission.READ_PHONE_STATE"
  | "android.permission.READ_SMS"
  | "android.permission.RECEIVE_MMS"
  | "android.permission.RECEIVE_SMS"
  | "android.permission.RECEIVE_WAP_PUSH"
  | "android.permission.RECORD_AUDIO"
  | "android.permission.SEND_SMS"
  | "android.permission.USE_SIP"
  | "android.permission.UWB_RANGING"
  | "android.permission.WRITE_CALENDAR"
  | "android.permission.WRITE_CALL_LOG"
  | "android.permission.WRITE_CONTACTS"
  | "android.permission.WRITE_EXTERNAL_STORAGE"
  | "com.android.voicemail.permission.ADD_VOICEMAIL"
  | "com.android.voicemail.permission.READ_VOICEMAIL"
  | "com.android.voicemail.permission.WRITE_VOICEMAIL"

/**
 * The user's answer to a request: `"never_ask_again"` once Android has
 * stopped asking.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export type Status = "granted" | "denied" | "never_ask_again"

/**
 * A dialog that explains why the app needs a permission, shown before the
 * request when Android suggests it: after the user has denied it once.
 * Any of its buttons goes on to the request.
 *
 * @stability experimental
 * @category models
 * @since 0.1.0
 */
export interface Rationale {
  readonly title: string
  readonly message: string
  readonly buttonPositive?: string | undefined
  readonly buttonNegative?: string | undefined
  readonly buttonNeutral?: string | undefined
}

const name = "PermissionsAndroid"

const onAndroid = <A>(
  method: string,
  otherwise: A,
  f: (module: any, d: Native.Device) => Promise<A>
): Effect.Effect<A, Native.DeviceError> =>
  Native.Device.use((d) =>
    d.os === "android"
      ? device.promise(name, method, f)
      : Effect.succeed(otherwise)
  )

/**
 * Whether the app holds `permission`.
 *
 * @stability experimental
 * @category getters
 * @since 0.1.0
 */
export const check = (
  permission: Permission
): Effect.Effect<boolean, Native.DeviceError> =>
  onAndroid("checkPermission", false, (m) => m.checkPermission(permission))

const explain = (d: Native.Device, rationale: Rationale) =>
  new Promise<void>((resolve, reject) => {
    const dialogs = d.module("DialogManagerAndroid")
    if (dialogs === undefined) return resolve()
    dialogs.showAlert(
      rationale,
      () => reject(new Error("Error showing rationale")),
      () => resolve()
    )
  })

/**
 * Asks the user for `permission`, showing `rationale` first when Android
 * suggests it.
 *
 * @stability experimental
 * @category actions
 * @since 0.1.0
 */
export const request = (
  permission: Permission,
  rationale?: Rationale
): Effect.Effect<Status, Native.DeviceError> =>
  onAndroid("requestPermission", "denied", async (m, d) => {
    if (
      rationale !== undefined &&
      await m.shouldShowRequestPermissionRationale(permission)
    ) {
      await explain(d, rationale)
    }
    return m.requestPermission(permission)
  })

/**
 * Asks the user for several permissions at once, and succeeds with each
 * one's answer.
 *
 * @stability experimental
 * @category actions
 * @since 0.1.0
 */
export const requestMultiple = <const P extends Permission>(
  permissions: ReadonlyArray<P>
): Effect.Effect<Record<P, Status>, Native.DeviceError> =>
  onAndroid(
    "requestMultiplePermissions",
    Object.fromEntries(permissions.map((p) => [p, "denied"])) as Record<
      P,
      Status
    >,
    (m) => m.requestMultiplePermissions(permissions)
  )

const RationaleSchema = Schema.Struct({
  title: Schema.String,
  message: Schema.String,
  buttonPositive: Schema.optional(Schema.String),
  buttonNegative: Schema.optional(Schema.String),
  buttonNeutral: Schema.optional(Schema.String)
})

// A permission is any string at runtime, so the Commands don't carry the
// list of them.
const PermissionSchema = Schema.String as unknown as Schema.Codec<Permission>

/**
 * The Command behind `check`.
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const Check: Command.Factory<
  { readonly permission: Permission },
  Result.Result<boolean, Native.DeviceError>
> = Command.make(
  "PermissionsAndroid.check",
  { args: { permission: PermissionSchema } },
  ({ permission }) => Effect.result(check(permission))
)

/**
 * The Command behind `request`.
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const Request: Command.Factory<
  {
    readonly permission: Permission
    readonly rationale?: Rationale | undefined
  },
  Result.Result<Status, Native.DeviceError>
> = Command.make(
  "PermissionsAndroid.request",
  {
    args: {
      permission: PermissionSchema,
      rationale: Schema.optional(RationaleSchema)
    }
  },
  ({ permission, rationale }) => Effect.result(request(permission, rationale))
)

/**
 * The Command behind `requestMultiple`.
 *
 * @stability experimental
 * @category commands
 * @since 0.1.0
 */
export const RequestMultiple: Command.Factory<
  { readonly permissions: ReadonlyArray<Permission> },
  Result.Result<Record<string, Status>, Native.DeviceError>
> = Command.make(
  "PermissionsAndroid.requestMultiple",
  { args: { permissions: Schema.Array(PermissionSchema) } },
  ({ permissions }) => Effect.result(requestMultiple(permissions))
)
