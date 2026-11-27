export const bootstrapConfig = {
  inputId: "domain-search",
  appId: "domains-app",
  readyEvent: "domains:ready",
  desktopMediaQuery: "(min-width: 701px) and (hover: hover) and (pointer: fine)"
}

export const bootstrapSearch = (
  { appId, desktopMediaQuery, inputId, readyEvent }: typeof bootstrapConfig,
  normalizeLabel: (query: string) => string
): void => {
  const input = document.getElementById(inputId)
  const app = document.getElementById(appId)
  if (!(input instanceof HTMLInputElement) || app === null) return
  // A prerendered page is the same for every `?q=`, so fill in its query.
  const query = new URLSearchParams(location.search).get("q")
  if (query !== null && input.defaultValue === "") input.defaultValue = query
  const controller = new AbortController()
  const options = { signal: controller.signal }
  const update = () => {
    app.setAttribute("data-search", input.value === "" ? "idle" : "active")
    if (input.value !== "") app.setAttribute("data-search-layout", "Search")
    app.querySelectorAll("[data-domain-label]").forEach((element) => {
      element.textContent = normalizeLabel(input.value)
    })
  }
  // The client takes its route from the URL, so an edit goes there too.
  const edit = () => {
    update()
    const url = new URL(location.href)
    if (input.value === "") url.searchParams.delete("q")
    else url.searchParams.set("q", input.value)
    history.replaceState(history.state, "", url)
  }
  const clear = () => {
    input.value = ""
    edit()
  }
  input.addEventListener("input", edit, options)
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !event.isComposing) {
      event.preventDefault()
      clear()
    }
  }, options)
  app.querySelector(".clear-search")?.addEventListener("click", () => {
    clear()
    input.focus({ preventScroll: true })
  }, options)
  document.addEventListener(readyEvent, () => controller.abort(), {
    once: true
  })
  if (query !== null || input.value !== input.defaultValue) update()
  if (
    window.matchMedia(desktopMediaQuery).matches &&
    document.activeElement === document.body
  ) {
    input.focus({ preventScroll: true })
  }
}
