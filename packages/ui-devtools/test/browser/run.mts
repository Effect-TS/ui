import { fileURLToPath } from "node:url"
import { type Browser, chromium } from "playwright"
import { createServer } from "vite"

export interface Context {
  readonly browser: Browser
  readonly url: string
  readonly failures: Array<string>
  readonly expect: (ok: unknown, what: string, detail: unknown) => void
}

export const run = async (
  name: string,
  body: (context: Context) => Promise<void>
): Promise<void> => {
  const at = process.argv.indexOf("--executable")
  const executablePath = at >= 0 ? process.argv[at + 1] : process.env.CHROMIUM

  const server = await createServer({
    root: import.meta.dirname,
    configFile: false,
    logLevel: "silent",
    resolve: {
      alias: {
        "@effect/ui-devtools": fileURLToPath(
          new URL("../../src/index.ts", import.meta.url)
        )
      }
    },
    server: { port: 0, strictPort: false }
  })
  await server.listen()
  const url = server.resolvedUrls!.local[0]
  const browser = await chromium.launch({
    ...(executablePath === undefined ? undefined : { executablePath })
  })
  const failures: Array<string> = []
  const expect = (ok: unknown, what: string, detail: unknown) => {
    if (!ok) failures.push(what + " " + JSON.stringify(detail))
  }
  try {
    await body({ browser, expect, failures, url })
  } catch (error) {
    failures.push(String(error).split("\n")[0])
  } finally {
    await browser.close()
    await server.close()
  }
  for (const failure of failures) console.log(failure)
  console.log(
    failures.length === 0
      ? name + ": ok"
      : name + ": " + failures.length + " failed"
  )
  process.exitCode = failures.length === 0 ? 0 : 1
}
