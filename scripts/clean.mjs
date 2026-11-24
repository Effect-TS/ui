import * as Glob from "glob"
import * as Fs from "node:fs"

const dirs = [
  ".",
  ...Glob.sync("packages/*/"),
  ...Glob.sync("packages/tools/*/")
]
dirs.forEach((pkg) => {
  const files = [
    ".tsbuildinfo",
    "tsconfig.tsbuildinfo",
    "docs",
    "build",
    "dist",
    "coverage"
  ]
  if (pkg !== ".") {
    files.push("AGENTS.md", "CLAUDE.md", "ai-docs")
  }

  files.forEach((file) => {
    if (pkg === "." && file === "docs") {
      return
    }

    Fs.rmSync(`${pkg}/${file}`, { recursive: true, force: true }, () => {})
  })
})
