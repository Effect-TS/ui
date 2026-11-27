/**
 * The CSS property name `.style` writes for a key: camelCase becomes
 * kebab-case, vendor prefixes get their leading dash, and `--custom` names
 * are kept.
 *
 * @internal
 */
export const cssProperty = (name: string): string =>
  name.startsWith("--")
    ? name
    : name.replace(/[A-Z]/g, (letter) => "-" + letter.toLowerCase())
      .replace(/^(webkit|moz|ms)-/, "-$1-")
