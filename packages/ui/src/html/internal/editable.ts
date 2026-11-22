/** @internal */

/**
 * The `input` types that take no typed characters, so a key pressed in one
 * isn't typing. Any other type counts as a text field, an unknown one included.
 *
 * @internal
 */
export const nonTextInputTypes: ReadonlySet<string> = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "image",
  "radio",
  "range",
  "reset",
  "submit"
])
