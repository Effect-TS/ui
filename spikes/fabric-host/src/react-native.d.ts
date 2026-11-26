// The two React Native internals the spike imports, which ship as Flow.
declare module "react-native/Libraries/StyleSheet/processColor" {
  const processColor: (color: unknown) => unknown
  export default processColor
}
declare module "react-native/Libraries/Utilities/Platform" {
  const Platform: { readonly OS: string }
  export default Platform
}
declare const process: { readonly env: Record<string, string | undefined> }
