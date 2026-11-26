import { build } from "esbuild"
import { fileURLToPath } from "node:url"
import { chromium, type Page } from "playwright"

/**
 * Runs the check `name`: bundles `${name}.ts` into a page that starts with `markup`, waits for it to
 * set `data-ready` on the body, and calls `check` with the page.
 */
export const run = async (
  name: string,
  markup: string,
  check: (
    page: Page,
    expect: (ok: unknown, what: string, detail: unknown) => void
  ) => Promise<void>
): Promise<void> => {
  const at = process.argv.indexOf("--executable")
  const executablePath = at >= 0 ? process.argv[at + 1] : process.env.CHROMIUM

  const bundle = await build({
    entryPoints: [fileURLToPath(new URL(`./${name}.ts`, import.meta.url))],
    bundle: true,
    write: false,
    format: "esm",
    target: "es2023",
    logLevel: "silent"
  })
  const html = `<!doctype html>
<html>
  <body>
    ${markup}
    <script type="module">${
    bundle.outputFiles[0].text.replaceAll("</script", "<\\/script")
  }</script>
  </body>
</html>`

  const browser = await chromium.launch({ executablePath })
  const failures: Array<string> = []
  const expect = (ok: unknown, what: string, detail: unknown) => {
    if (!ok) failures.push(what + " " + JSON.stringify(detail))
  }

  const page = await browser.newPage({ viewport: { width: 800, height: 600 } })
  page.on("pageerror", (error) => failures.push("page error " + String(error)))
  await page.route(
    "http://check.test/",
    (route) => route.fulfill({ contentType: "text/html", body: html })
  )
  try {
    await page.goto("http://check.test/")
    await page.waitForSelector("body[data-ready]", { state: "attached" })
    await check(page, expect)
  } catch (error) {
    failures.push(String(error).split("\n")[0])
  } finally {
    await browser.close()
  }

  if (failures.length > 0) {
    console.error(failures.join("\n"))
    process.exit(1)
  }
  console.log(`check-${name}: ok`)
}
