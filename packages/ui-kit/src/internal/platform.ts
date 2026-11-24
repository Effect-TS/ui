const agentPlatform = (view: Window): string | undefined =>
  (view.navigator as Navigator & {
    readonly userAgentData?: { readonly platform: string }
  }).userAgentData?.platform

export const isAndroid = (view: Window | null): boolean =>
  view !== null &&
  (agentPlatform(view) === "Android" ||
    /android/i.test(view.navigator.userAgent))

export const isIOS = (view: Window | null): boolean => {
  if (view === null) return false
  const platform = view.navigator.platform.toLowerCase()
  // An iPad reports itself as a Mac, with a touch screen.
  return /^i(os$|p)/.test(platform) ||
    (platform === "macintel" && view.navigator.maxTouchPoints > 1)
}

export const isWebKit = (view: Window | null): boolean =>
  (view as (Window & { readonly CSS?: typeof CSS }) | null)?.CSS?.supports?.(
    "-webkit-backdrop-filter:none"
  ) === true

export const isGecko = (view: Window | null): boolean =>
  view !== null && !isWebKit(view) && /firefox/i.test(view.navigator.userAgent)

export const isMac = (view: Window | null): boolean =>
  view !== null &&
  (agentPlatform(view) === "macOS" ||
    (/^mac/i.test(view.navigator.platform) &&
      view.navigator.maxTouchPoints <= 1))
