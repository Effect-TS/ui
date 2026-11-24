export const wide = [
  "relative left-1/2 my-10 max-w-none transform-[translateX(-50%)]",
  "w-[min(var(--wide),calc(100vw-2*clamp(20px,5vw,48px)))]",
  "rail:w-[min(var(--wide),calc(min(100vw-var(--nav-rail),var(--nav-article))-2*var(--nav-gutter)))]",
  "[p+&]:mt-[1.1em]"
].join(" ")

export const caption =
  "mt-4 max-w-[68ch] text-sm text-muted-foreground"

export const srOnly =
  "absolute size-px overflow-hidden [clip-path:inset(50%)]"
