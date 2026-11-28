// Turns on React Native's W3C pointer events, which are off by default on
// both platforms. Without them native sends no `pointer*` or `click`
// events, and `Pressable`'s `onHoverIn` and `onHoverOut` never fire.
// Each flag is read when the first surface starts, so it is set at launch.
const { withAppDelegate, withMainApplication } = require("expo/config-plugins")

const insertAfter = (contents, anchor, line, file) => {
  if (contents.includes(line)) return contents
  const match = contents.match(anchor)
  if (match === null) {
    throw new Error(
      `withPointerEvents: no place to turn on pointer events in ${file}`
    )
  }
  const end = match.index + match[0].length
  return contents.slice(0, end) + "\n" + line + contents.slice(end)
}

module.exports = (config) =>
  withMainApplication(
    withAppDelegate(config, (config) => {
      config.modResults.contents = insertAfter(
        config.modResults.contents,
        /didFinishLaunchingWithOptions[^{]*\{/,
        "    RCTSetDispatchW3CPointerEvents(true)",
        "AppDelegate"
      )
      return config
    }),
    (config) => {
      config.modResults.contents = insertAfter(
        config.modResults.contents,
        /super\.onCreate\(\)/,
        "    com.facebook.react.config.ReactFeatureFlags.dispatchPointerEvents = true",
        "MainApplication"
      )
      return config
    }
  )
