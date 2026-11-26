// The stock Expo entry, pointed at an @effect/ui root on Fabric instead of
// `registerRootComponent(App)`. EXPO_PUBLIC_* variables are inlined at build
// time, so the unused branches are not bundled.
// oxlint-disable import/no-unassigned-import
if (process.env.EXPO_PUBLIC_SPIKE_EXPO === "1") require("expo")
if (process.env.EXPO_PUBLIC_SPIKE === "react-bench") {
  require("./src/react/main.tsx")
} else if (process.env.EXPO_PUBLIC_SPIKE === "react-template") {
  require("./template.ts")
} else if (process.env.EXPO_PUBLIC_SPIKE_PREBUILT === "1") {
  if (process.env.EXPO_PUBLIC_SPIKE === "bench") require("./prebuilt/bench.cjs")
  else require("./prebuilt/counter.cjs")
} else if (process.env.EXPO_PUBLIC_SPIKE === "bench") {
  require("./src/main-bench.ts")
} else require("./src/main-counter.ts")
