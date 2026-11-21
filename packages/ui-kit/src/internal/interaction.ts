export const methodOf = (pointerType: string): "mouse" | "touch" | "pen" | "keyboard" =>
  pointerType === "touch" || pointerType === "pen" ? pointerType : pointerType === "" ? "keyboard" : "mouse"
