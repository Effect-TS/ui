import { execFile } from "node:child_process"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { promisify } from "node:util"
import { describe, expect, it } from "vitest"

const execFileAsync = promisify(execFile)
const repoRoot = path.resolve(import.meta.dirname, "../../../..")
const oxlintBin = path.join(repoRoot, "node_modules/.bin/oxlint")
const oxlintConfig = path.join(repoRoot, ".oxlintrc.json")

async function withTempFile(
  name: string,
  content: string,
  fn: (filePath: string) => Promise<void>
): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "effect-oxc-sort-imports-"))
  const filePath = path.join(dir, name)
  fs.writeFileSync(filePath, content, "utf8")
  try {
    await fn(filePath)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

async function runOxlint(args: ReadonlyArray<string>): Promise<void> {
  await execFileAsync(oxlintBin, ["-c", oxlintConfig, ...args], {
    cwd: repoRoot
  })
}

describe("effect/sort-imports", () => {
  it("moves declarations and sorts named imports in a single fix pass", () =>
    withTempFile(
      "move-and-sort.ts",
      [
        `import { z, A, m } from "./local.ts"`,
        `import { make, type Component } from "@effect/ui/Component"`,
        `import { succeed, type Effect, fail } from "effect/Effect"`,
        "",
        "export const x: [unknown, unknown, unknown, unknown, Component | null, unknown, Effect<never> | null, unknown] = [z, A, m, make, null, succeed, null, fail]",
        ""
      ].join("\n"),
      async (filePath) => {
        await runOxlint(["--fix", filePath])
        const afterPass1 = fs.readFileSync(filePath, "utf8")
        expect(afterPass1).toBe(
          [
            `import { type Effect, fail, succeed } from "effect/Effect"`,
            "",
            `import { type Component, make } from "@effect/ui/Component"`,
            "",
            `import { A, m, z } from "./local.ts"`,
            "",
            "export const x: [unknown, unknown, unknown, unknown, Component | null, unknown, Effect<never> | null, unknown] = [z, A, m, make, null, succeed, null, fail]",
            ""
          ].join("\n")
        )

        await runOxlint([filePath])
        await runOxlint(["--fix", filePath])
        expect(fs.readFileSync(filePath, "utf8")).toBe(afterPass1)
      }
    ))

  it("treats bare side-effect imports as boundaries", () =>
    withTempFile(
      "side-effects.ts",
      [
        `import { LocalA } from "./a.ts"`,
        `import * as Effect from "effect/Effect"`,
        "// oxlint-disable-next-line no-unassigned-import",
        `import "./setup.ts"`,
        `import { LocalB } from "./b.ts"`,
        `import { Head } from "@effect/ui/Head"`,
        "",
        "export const x = [LocalA, Effect, LocalB, Head]",
        ""
      ].join("\n"),
      async (filePath) => {
        await runOxlint(["--fix", filePath])
        const afterPass1 = fs.readFileSync(filePath, "utf8")
        expect(afterPass1).toBe(
          [
            `import * as Effect from "effect/Effect"`,
            "",
            `import { LocalA } from "./a.ts"`,
            "// oxlint-disable-next-line no-unassigned-import",
            `import "./setup.ts"`,
            `import { Head } from "@effect/ui/Head"`,
            "",
            `import { LocalB } from "./b.ts"`,
            "",
            "export const x = [LocalA, Effect, LocalB, Head]",
            ""
          ].join("\n")
        )

        await runOxlint([filePath])
      }
    ))

  it("keeps file headers pinned and preserves leading and trailing import comments in one pass", () =>
    withTempFile(
      "comments.ts",
      [
        "#!/usr/bin/env node",
        "/**",
        " * @since 4.0.0",
        " */",
        "// scoped note",
        `import { Head } from "@effect/ui/Head" // scoped trailing`,
        `import { Local } from "./local.ts" // local trailing`,
        `import * as Effect from "effect/Effect" // unscoped trailing`,
        "",
        "export const x = [Head, Local, Effect]",
        ""
      ].join("\n"),
      async (filePath) => {
        await runOxlint(["--fix", filePath])
        const afterPass1 = fs.readFileSync(filePath, "utf8")
        expect(afterPass1).toBe(
          [
            "#!/usr/bin/env node",
            "/**",
            " * @since 4.0.0",
            " */",
            `import * as Effect from "effect/Effect" // unscoped trailing`,
            "",
            "// scoped note",
            `import { Head } from "@effect/ui/Head" // scoped trailing`,
            "",
            `import { Local } from "./local.ts" // local trailing`,
            "",
            "export const x = [Head, Local, Effect]",
            ""
          ].join("\n")
        )

        await runOxlint([filePath])
        await runOxlint(["--fix", filePath])
        expect(fs.readFileSync(filePath, "utf8")).toBe(afterPass1)
      }
    ))
})
