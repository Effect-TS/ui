import { build } from "esbuild"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright"

const at = process.argv.indexOf("--executable")
const executablePath = at >= 0 ? process.argv[at + 1] : process.env.CHROMIUM

const bundle = await build({
  entryPoints: [fileURLToPath(new URL("./ssr.ts", import.meta.url))],
  bundle: true,
  write: false,
  format: "esm",
  target: "es2023",
  logLevel: "silent"
})
const html = `<!doctype html>
<html>
  <body>
    <script type="module">${
  bundle.outputFiles[0].text.replaceAll("</script", "<\\/script")
}</script>
  </body>
</html>`

const browser = await chromium.launch({ executablePath })
const failures = []
const expect = (ok, what, detail) => {
  if (!ok) failures.push(what + " " + JSON.stringify(detail))
}

const page = await browser.newPage()
page.on("pageerror", (error) => failures.push("page error " + String(error)))
await page.route(
  "http://check.test/",
  (route) => route.fulfill({ contentType: "text/html", body: html })
)
try {
  await page.goto("http://check.test/")
  await page.waitForSelector("body[data-ready]", { state: "attached" })
  const { popover, modal } = await page.evaluate(() => globalThis.results)
  expect(
    popover.matches === true,
    "a popover open from the start hydrates open",
    popover
  )
  expect(
    modal.matches === true,
    "a dialog modal from the start hydrates modal",
    modal
  )
} catch (error) {
  failures.push(String(error).split("\n")[0])
} finally {
  await browser.close()
}

if (failures.length > 0) {
  console.error(failures.join("\n"))
  process.exit(1)
}
console.log("check-ssr: ok")
