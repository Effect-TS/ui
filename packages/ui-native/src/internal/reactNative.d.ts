// The React Native modules ui-native reaches into, which ship no types.

// The style processors: `processColor`, `processTransform` and so on.
declare module "react-native/Libraries/StyleSheet/process*" {
  const process: (value: any) => any
  export default process
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

declare module "react-native/Libraries/Core/setUpXHR" {}

declare module "react-native/Libraries/Utilities/DevSettings" {
  const DevSettings: {
    readonly reload: (reason?: string) => void
    readonly onFastRefresh: () => void
  }
  export default DevSettings
}
