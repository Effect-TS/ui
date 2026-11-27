// The React Native modules ui-native reaches into, which ship no types.

declare module "react-native/Libraries/StyleSheet/processColor" {
  const processColor: (color: unknown) => any
  export default processColor
}

declare module "react-native/Libraries/Utilities/Platform" {
  const Platform: { readonly OS: string }
  export default Platform
}

declare module "react-native/Libraries/EventEmitter/RCTDeviceEventEmitter" {
  const RCTDeviceEventEmitter: {
    readonly addListener: (
      type: string,
      listener: (...args: ReadonlyArray<any>) => void
    ) => { readonly remove: () => void }
    readonly listenerCount: (type: string) => number
  }
  export default RCTDeviceEventEmitter
}

declare module "react-native/Libraries/NativeModules/specs/NativeDeviceEventManager" {
  const NativeDeviceEventManager: {
    readonly invokeDefaultBackPressHandler: () => void
  } | null
  export default NativeDeviceEventManager
}

declare module "react-native/Libraries/WebSocket/WebSocket" {
  const WebSocket: typeof globalThis.WebSocket
  export default WebSocket
}

declare module "react-native/Libraries/Core/Devtools/getDevServer" {
  const getDevServer: () => { readonly fullBundleUrl: string | null }
  export default getDevServer
}

declare module "react-native/Libraries/Utilities/DevSettings" {
  const DevSettings: {
    readonly reload: (reason?: string) => void
    readonly onFastRefresh: () => void
  }
  export default DevSettings
}

declare module "react-native/Libraries/StyleSheet/processBackgroundImage" {
  const processBackgroundImage: (value: any) => any
  export default processBackgroundImage
}

declare module "react-native/Libraries/StyleSheet/processBackgroundPosition" {
  const processBackgroundPosition: (value: any) => any
  export default processBackgroundPosition
}

declare module "react-native/Libraries/StyleSheet/processBackgroundRepeat" {
  const processBackgroundRepeat: (value: any) => any
  export default processBackgroundRepeat
}

declare module "react-native/Libraries/StyleSheet/processBackgroundSize" {
  const processBackgroundSize: (value: any) => any
  export default processBackgroundSize
}

declare module "react-native/Libraries/StyleSheet/processBoxShadow" {
  const processBoxShadow: (value: any) => any
  export default processBoxShadow
}

declare module "react-native/Libraries/StyleSheet/processFilter" {
  const processFilter: (value: any) => any
  export default processFilter
}

declare module "react-native/Libraries/StyleSheet/processTransform" {
  const processTransform: (value: any) => any
  export default processTransform
}

declare module "react-native/Libraries/StyleSheet/processTransformOrigin" {
  const processTransformOrigin: (value: any) => any
  export default processTransformOrigin
}
