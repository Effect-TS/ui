/**
 * Shared by `.style` and its matcher so both normalize names the same way.
 *
 * @internal
 */
export const cssProperty = (name: string): string =>
  name.startsWith("--")
    ? name
    : name.replace(/[A-Z]/g, (letter) => "-" + letter.toLowerCase())
      .replace(/^(webkit|moz|ms)-/, "-$1-")
