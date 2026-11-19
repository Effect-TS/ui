// A data attribute is present, with an empty value, or absent.
export const flag = (on: boolean | undefined): string | undefined => on === true ? "" : undefined

// A part adds its declarations, in `forward`, after the consumer's inline
// style, so its own win and the consumer's others stay, including a style
// chained after the part.
export const withStyle = (consumer: string | undefined, own: string): string =>
  consumer === undefined || consumer.trim() === "" ? own : consumer.replace(/;\s*$/, "") + ";" + own

// Visually hidden, but read by screen readers.
export const visuallyHidden =
  "position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0"
