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

declare module "react-native/Libraries/Components/Sound/NativeSoundManager" {
  const NativeSoundManager: { readonly playTouchSound: () => void } | null
  export default NativeSoundManager
}

declare module "react-native/asset-registry" {
  export interface PackagerAsset {
    readonly __packager_asset?: boolean | undefined
    readonly httpServerLocation: string
    readonly width?: number | undefined
    readonly height?: number | undefined
    readonly scales: ReadonlyArray<number>
    readonly hash: string
    readonly name: string
    readonly type: string
    readonly resolver?: "android" | "generic" | undefined
  }
  export const registerAsset: (asset: PackagerAsset) => number
  export const getAssetByID: (assetId: number) => PackagerAsset | undefined
  const AssetRegistry: {
    readonly registerAsset: typeof registerAsset
    readonly getAssetByID: typeof getAssetByID
  }
  export default AssetRegistry
}

declare module "react-native/Libraries/TurboModule/TurboModuleRegistry" {
  export function get<T = Record<string, any>>(name: string): T | null
}
