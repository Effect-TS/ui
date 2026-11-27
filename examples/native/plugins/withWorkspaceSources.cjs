// Gradle bundles a release build again only when the bundle task's inputs
// change, and React Native's inputs stop at this app's directory. This config
// plugin adds the sources of the workspace packages the app links, so editing
// one of them makes the next `assembleRelease` bundle again.
const { withAppBuildGradle } = require("expo/config-plugins")
const Fs = require("node:fs")
const Path = require("node:path")

const begin = "// @generated begin withWorkspaceSources"
const end = "// @generated end withWorkspaceSources"

// Packages linked from outside any node_modules, following their
// dependencies and peer dependencies.
const workspacePackages = (directory, found = new Set()) => {
  const manifest = JSON.parse(
    Fs.readFileSync(Path.join(directory, "package.json"), "utf8")
  )
  for (
    const name of Object.keys({
      ...manifest.dependencies,
      ...manifest.peerDependencies
    })
  ) {
    const link = Path.join(directory, "node_modules", name)
    if (!Fs.existsSync(link)) continue
    const real = Fs.realpathSync(link)
    if (real.split(Path.sep).includes("node_modules") || found.has(real)) {
      continue
    }
    found.add(real)
    workspacePackages(real, found)
  }
  return found
}

module.exports = (config) =>
  withAppBuildGradle(config, (config) => {
    const projectRoot = config.modRequest.projectRoot
    const directories = [...workspacePackages(projectRoot)].map((directory) =>
      JSON.stringify(
        Path.relative(projectRoot, directory).split(Path.sep).join("/")
      )
    )
    const block = [
      begin,
      "tasks.withType(com.facebook.react.tasks.BundleHermesCTask).configureEach {",
      `    [${directories.join(", ")}].each { directory ->`,
      "        inputs.files(fileTree(new File(rootDir.parentFile, directory)) {",
      "            include \"**/*.js\", \"**/*.jsx\", \"**/*.ts\", \"**/*.tsx\"",
      "            exclude \"**/android/**\", \"**/ios/**\", \"**/build/**\", \"**/node_modules/**\"",
      "        })",
      "    }",
      "}",
      end
    ].join("\n")
    const contents = config.modResults.contents
    const start = contents.indexOf(begin)
    config.modResults.contents = start === -1
      ? contents.trimEnd() + "\n\n" + block + "\n"
      : contents.slice(0, start) + block +
        contents.slice(contents.indexOf(end) + end.length)
    return config
  })
