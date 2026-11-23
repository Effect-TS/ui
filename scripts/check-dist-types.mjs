// Type-checks the built `@effect/ui` declarations the way a consumer with
// `skipLibCheck: false` does. Run after `pnpm build` with `stripInternal`
// enabled to catch public declarations that reference `@internal` symbols.
import { execFileSync } from "node:child_process"
import * as Fs from "node:fs"
import * as Os from "node:os"
import * as Path from "node:path"
import { fileURLToPath } from "node:url"

const root = Path.resolve(Path.dirname(fileURLToPath(import.meta.url)), "..")
const pkgDir = Path.join(root, "packages", "ui")
const dist = Path.join(pkgDir, "dist")

if (!Fs.existsSync(Path.join(dist, "index.d.ts"))) {
  console.error("packages/ui/dist is missing; run `pnpm build` first")
  process.exit(1)
}

const pkg = JSON.parse(Fs.readFileSync(Path.join(pkgDir, "package.json"), "utf8"))
const exported = Object.entries(pkg.publishConfig.exports)
  .filter(([key, target]) => target !== null && key !== "./package.json" && !key.includes("*"))
const entrypoints = exported
  .filter(([, target]) => typeof target === "string")
  .map(([key, target]) => [Path.posix.join(pkg.name, key), [Path.join(pkgDir, target.replace(/\.js$/, ".d.ts"))]])

const ambient = exported
  .filter(([, target]) => typeof target === "object")
  .map(([, target]) => Path.join(pkgDir, target.types))

const dir = Fs.mkdtempSync(Path.join(Os.tmpdir(), "effect-ui-dist-types-"))
try {
  Fs.writeFileSync(
    Path.join(dir, "index.ts"),
    entrypoints.map(([entry], i) => `import * as _${i} from "${entry}"\nexport { _${i} }\n`).join("")
  )
  const config = {
    compilerOptions: {
      strict: true,
      noEmit: true,
      target: "ES2022",
      module: "ESNext",
      moduleResolution: "bundler",
      skipLibCheck: false,
      types: ["node"],
      typeRoots: [Path.join(root, "node_modules", "@types")],
      paths: {
        ...Object.fromEntries(entrypoints),
        [`${pkg.name}/*`]: [Path.join(dist, "*")]
      }
    },
    files: ["index.ts"]
  }
  Fs.writeFileSync(
    Path.join(dir, "content.ts"),
    [
      `import document, { frontmatter } from "./post.md"`,
      `export const blocks: ReadonlyArray<unknown> = document.blocks`,
      `export const title: string | undefined = frontmatter?.title`
    ].join("\n")
  )
  config.files = ["index.ts", "content.ts", ...ambient]
  Fs.writeFileSync(Path.join(dir, "tsconfig.json"), JSON.stringify(config))
  execFileSync("pnpm", ["exec", "tsc", "-p", Path.join(dir, "tsconfig.json")], { cwd: root, stdio: "inherit" })

  // Only `@effect/ui/html` may need the DOM lib: the core and its testing
  // helpers must type check without it.
  Fs.writeFileSync(
    Path.join(dir, "index.ts"),
    ["@effect/ui", "@effect/ui/Query", "@effect/ui/testing", "@effect/ui/testing/TestQuery"]
      .map((entry, i) => `import * as _${i} from "${entry}"\nexport { _${i} }\n`).join("")
  )
  config.files = ["index.ts"]
  config.compilerOptions.lib = ["ES2024"]
  config.compilerOptions.exactOptionalPropertyTypes = true
  Fs.writeFileSync(Path.join(dir, "tsconfig.json"), JSON.stringify(config))
  execFileSync("pnpm", ["exec", "tsc", "-p", Path.join(dir, "tsconfig.json")], { cwd: root, stdio: "inherit" })
} catch (error) {
  process.exitCode = typeof error.status === "number" ? error.status : 1
} finally {
  Fs.rmSync(dir, { recursive: true, force: true })
}
