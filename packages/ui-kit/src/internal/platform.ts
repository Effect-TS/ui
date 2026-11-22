export const isAndroid = (view: Window | null): boolean => {
  if (view === null) return false
  const agent = view.navigator as Navigator & { readonly userAgentData?: { readonly platform: string } }
  return agent.userAgentData?.platform === "Android" || /android/i.test(agent.userAgent)
}

export const isIOS = (view: Window | null): boolean => {
  if (view === null) return false
  const platform = view.navigator.platform.toLowerCase()
  // An iPad reports itself as a Mac, with a touch screen.
  return /^i(os$|p)/.test(platform) || (platform === "macintel" && view.navigator.maxTouchPoints > 1)
}

export const isWebKit = (view: Window | null): boolean =>
  (view as (Window & { readonly CSS?: typeof CSS }) | null)?.CSS?.supports?.("-webkit-backdrop-filter:none") === true

export const isGecko = (view: Window | null): boolean =>
  view !== null && !isWebKit(view) && /firefox/i.test(view.navigator.userAgent)
