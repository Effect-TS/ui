import { assert, describe, it } from "@effect/vitest"
import * as Glob from "glob"
import * as Fs from "node:fs"
import * as Path from "node:path"

const root = Path.resolve(import.meta.dirname, "..")

const publicPackages = (): Array<string> =>
  Glob.globSync("packages/{*,*/*}/package.json", { cwd: root, posix: true })
    .filter((file) => {
      const pkg = JSON.parse(Fs.readFileSync(Path.join(root, file), "utf8"))
      return !pkg.private
    })
    .map((file) => Path.posix.normalize(Path.posix.dirname(file)))
    .sort()

const snapshotPackages = (): Array<string> => {
  const workflow = Fs.readFileSync(
    Path.join(root, ".github/workflows/snapshot.yml"),
    "utf8"
  ).replace(/\\\r?\n/g, " ")
  const match = workflow.match(/pkg-pr-new\s+publish\b([^\n]*)/)
  if (match === null) {
    throw new Error("Missing pkg-pr-new publish command in snapshot.yml")
  }
  return match[1]
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0 && !token.startsWith("-"))
    .map((token) => Path.posix.normalize(token.replaceAll("\\", "/")))
    .sort()
}

describe("snapshot workflow", () => {
  it("publishes every public workspace package", () => {
    assert.deepStrictEqual(snapshotPackages(), publicPackages())
  })
})
