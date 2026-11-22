import { chromium, firefox, webkit } from "playwright"
import { createServer } from "vite"

const total = 500
const page = 50
const limit = 1
const settledFrames = 4

const engines = { chromium, firefox, webkit }
const args = process.argv.slice(2)
const engine = args.find((arg) => arg in engines) ?? "chromium"
const at = args.indexOf("--executable")
const executablePath = at >= 0 ? args[at + 1] : undefined

const transitions = Array.from({ length: (total - page) / page }, (_, i) => ({
  from: total - page - i * page,
  to: total - 2 * page - i * page
}))

const landingOf = (samples, { from, to }) =>
  samples.findIndex((sample, i) => i > 0 && sample.start === to && samples[i - 1].start === from)

const measure = (samples, { from, to }) => {
  const landing = landingOf(samples, { from, to })
  if (landing < 0) return { from, to, problem: "no landing recorded" }
  const quiet = samples.slice(landing - settledFrames, landing)
  if (
    quiet.length < settledFrames ||
    quiet.some((sample) => sample.start !== from || sample.scrollTop !== quiet[0].scrollTop)
  ) return { from, to, problem: "landed before the scroll settled" }
  const before = samples[landing - 1].under
  if (before === null) return { from, to, problem: "no message under the pointer" }
  const shift = (sample) => {
    const top = sample?.tops[before.key]
    return top === undefined ? null : top - before.top
  }
  const nextFrame = shift(samples[landing])
  const settled = shift(samples[landing + 3])
  if (nextFrame === null || settled === null) return { from, to, key: before.key, problem: "message not rendered" }
  return { from, to, key: before.key, nextFrame, settled }
}

const judge = (measured) => {
  const complete = measured.length === transitions.length &&
    measured.every((m, i) => m.from === transitions[i].from && m.to === transitions[i].to)
  const failures = measured.filter((m) =>
    m.problem !== undefined || !(Math.abs(m.nextFrame) <= limit && Math.abs(m.settled) <= limit)
  )
  return complete && failures.length === 0
}

const server = await createServer({
  root: import.meta.dirname,
  configFile: false,
  logLevel: "silent",
  server: { port: 0, strictPort: false }
})
await server.listen()
const url = server.resolvedUrls.local[0]

const browser = await engines[engine].launch({ executablePath })
let failed = false
try {
  const tab = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  tab.on("pageerror", (error) => {
    failed = true
    console.log("page error: " + String(error))
  })
  await tab.goto(url + "?demo=chat")
  await tab.waitForSelector("[data-virtual-list-item]")
  const box = await tab.evaluate(() => {
    const rect = document.querySelector(".scroller").getBoundingClientRect()
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  })
  await tab.evaluate((y) => {
    const scroller = document.querySelector(".scroller")
    const status = document.getElementById("status")
    window.samples = []
    const channel = new MessageChannel()
    channel.port1.onmessage = () => {
      const tops = {}
      let under = null
      for (const item of document.querySelectorAll("[data-virtual-list-item]")) {
        const rect = item.getBoundingClientRect()
        tops[item.dataset.key] = rect.top
        if (rect.bottom > y && (under === null || rect.top < under.top)) under = { key: item.dataset.key, top: rect.top }
      }
      window.samples.push({ start: Number(status.dataset.start), scrollTop: scroller.scrollTop, under, tops })
      requestAnimationFrame(next)
    }
    const next = () => channel.port2.postMessage(null)
    requestAnimationFrame(next)
  }, box.y)
  await tab.mouse.move(box.x, box.y)

  const status = () =>
    tab.evaluate(() => {
      const element = document.getElementById("status")
      return { start: Number(element.dataset.start), loading: element.dataset.loading === "true" }
    })
  const recorded = []
  for (const transition of transitions) {
    let now = await status()
    if (now.start !== transition.from) break
    await tab.evaluate(() => (window.samples = []))
    const began = Date.now()
    while (!now.loading && Date.now() - began < 20_000) {
      await tab.mouse.wheel(0, -100)
      await tab.waitForTimeout(16)
      now = await status()
    }
    await tab.waitForFunction((to) => Number(document.getElementById("status").dataset.start) === to, transition.to, {
      timeout: 5_000
    }).catch(() => {})
    await tab.waitForTimeout(200)
    recorded.push({ transition, samples: await tab.evaluate(() => window.samples) })
  }

  const measured = recorded.map(({ samples, transition }) => measure(samples, transition))
  const pass = judge(measured)
  failed ||= !pass
  console.log(engine + " " + browser.version() + ": " + (pass ? "PASS" : "FAIL"))
  for (const m of measured) {
    console.log(
      "  " + m.from + " -> " + m.to + "  " + (m.key ?? "") + "  " +
        (m.problem ?? "next frame " + m.nextFrame.toFixed(3) + "px, settled " + m.settled.toFixed(3) + "px")
    )
  }
  if (measured.length < transitions.length) {
    console.log("  measured " + measured.length + " of " + transitions.length + " landings")
  }

  if (pass) {
    const replay = (label, change) => {
      const copy = structuredClone(recorded)
      change(copy)
      const result = judge(copy.map(({ samples, transition }) => measure(samples, transition)))
      failed ||= result
      console.log("  replay, " + label + ": " + (result ? "PASS, so the check is broken" : "FAIL, as it should"))
    }
    replay("the landing to 0 missing", (copy) => {
      const last = copy[copy.length - 1]
      last.samples = last.samples.slice(0, landingOf(last.samples, last.transition))
    })
    replay("the landing to 200 still scrolling", (copy) => {
      const one = copy.find(({ transition }) => transition.to === 200)
      one.samples[landingOf(one.samples, one.transition) - 2].scrollTop += 1
    })
    replay("one message moved by 1.01px on the landing to 200", (copy) => {
      const one = copy.find(({ transition }) => transition.to === 200)
      const landing = landingOf(one.samples, one.transition)
      const key = one.samples[landing - 1].under.key
      one.samples[landing].tops[key] = one.samples[landing - 1].under.top + 1.01
    })
  }
} finally {
  await browser.close()
  await server.close()
}
process.exit(failed ? 1 : 0)
