export const isAndroid = (view: Window | null): boolean => {
  if (view === null) return false
  const agent = view.navigator as Navigator & { readonly userAgentData?: { readonly platform: string } }
  return agent.userAgentData?.platform === "Android" || /android/i.test(agent.userAgent)
}
