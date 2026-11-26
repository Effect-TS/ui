// Resolves @effect/ui and effect from the ui repository's own packages, as a
// workspace consumer would, without adding Expo to the pnpm workspace.
const { getDefaultConfig } = require("expo/metro-config")
const path = require("node:path")

const repo = path.resolve(__dirname, "../..")
const config = getDefaultConfig(__dirname)

config.watchFolders = [repo]
config.resolver.nodeModulesPaths = [
  path.join(__dirname, "node_modules"),
  path.join(repo, "packages/ui/node_modules"),
  path.join(repo, "node_modules")
]
config.resolver.extraNodeModules = {
  "@effect/ui": path.join(repo, "packages/ui")
}
// @effect/ui strips development checks under the `production` condition.
if (process.env.NODE_ENV === "production") {
  config.resolver.unstable_conditionNames = [
    ...config.resolver.unstable_conditionNames,
    "production"
  ]
}

// Expo's tree shaking (EXPO_UNSTABLE_TREE_SHAKING=1) needs ESM kept until serialization.
if (process.env.EXPO_UNSTABLE_TREE_SHAKING === "1") {
  config.transformer.getTransformOptions = async () => ({
    transform: { experimentalImportSupport: true, inlineRequires: false }
  })
}

module.exports = config
