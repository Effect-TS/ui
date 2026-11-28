import type { Setting } from "../AccessibilityInfo.ts"

/**
 * Each setting's getter and event, on Android then iOS.
 *
 * @internal
 */
export const settings: Record<
  Setting,
  readonly [
    android: readonly [string, string] | undefined,
    ios?: readonly [string, string]
  ]
> = {
  screenReader: [
    ["isTouchExplorationEnabled", "touchExplorationDidChange"],
    ["getCurrentVoiceOverState", "screenReaderChanged"]
  ],
  reduceMotion: [
    ["isReduceMotionEnabled", "reduceMotionDidChange"],
    ["getCurrentReduceMotionState", "reduceMotionChanged"]
  ],
  invertColors: [
    ["isInvertColorsEnabled", "invertColorDidChange"],
    ["getCurrentInvertColorsState", "invertColorsChanged"]
  ],
  grayscale: [
    ["isGrayscaleEnabled", "grayscaleModeDidChange"],
    ["getCurrentGrayscaleState", "grayscaleChanged"]
  ],
  boldText: [undefined, ["getCurrentBoldTextState", "boldTextChanged"]],
  reduceTransparency: [undefined, [
    "getCurrentReduceTransparencyState",
    "reduceTransparencyChanged"
  ]],
  darkerSystemColors: [undefined, [
    "getCurrentDarkerSystemColorsState",
    "darkerSystemColorsChanged"
  ]],
  highTextContrast: [[
    "isHighTextContrastEnabled",
    "highTextContrastDidChange"
  ]],
  accessibilityService: [[
    "isAccessibilityServiceEnabled",
    "accessibilityServiceDidChange"
  ]]
}
