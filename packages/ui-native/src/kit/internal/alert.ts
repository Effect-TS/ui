import type { Button } from "../Alert.ts"

const ok: ReadonlyArray<Button> = [{ id: "ok", text: "OK" }]

/**
 * The dialog's buttons: `buttons`, or one OK button without any.
 *
 * @internal
 */
export const buttonsOf = (
  buttons: ReadonlyArray<Button> | undefined
): ReadonlyArray<Button> => buttons?.length ? buttons : ok

/**
 * The buttons an Android dialog shows, as its neutral, negative and
 * positive buttons: the last three.
 *
 * @internal
 */
export const androidButtons = (
  buttons: ReadonlyArray<Button>
): readonly [Button | undefined, Button | undefined, Button | undefined] =>
  [undefined, undefined, ...buttons.slice(-3)].slice(-3) as any
