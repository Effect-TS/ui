// A data attribute is present, with an empty value, or absent.
export const flag = (on: boolean | undefined): string | undefined => on === true ? "" : undefined
