import { getAssetByID, type PackagerAsset } from "react-native/asset-registry"
import { get as getTurboModule } from "react-native/Libraries/TurboModule/TurboModuleRegistry"

export interface ResolvedAsset {
  readonly __packager_asset: true
  readonly uri: string
  readonly width?: number | undefined
  readonly height?: number | undefined
  readonly scale: number
}

const androidScales: Readonly<Record<string, string>> = {
  "0.75": "ldpi",
  "1": "mdpi",
  "1.5": "hdpi",
  "2": "xhdpi",
  "3": "xxhdpi",
  "4": "xxxhdpi"
}

const drawableTypes: Readonly<Record<string, true>> = {
  gif: true,
  heic: true,
  heif: true,
  jpeg: true,
  jpg: true,
  ktx: true,
  png: true,
  webp: true,
  xml: true
}

const pickScale = (
  scales: ReadonlyArray<number>,
  deviceScale: number
): number => {
  for (let i = 0; i < scales.length; i++) {
    if (scales[i]! >= deviceScale) return scales[i]!
  }
  return scales[scales.length - 1] || 1
}

const basePath = (asset: PackagerAsset): string =>
  asset.httpServerLocation.startsWith("/")
    ? asset.httpServerLocation.slice(1)
    : asset.httpServerLocation

const scaledPath = (asset: PackagerAsset, scale: number): string =>
  `${basePath(asset)}/${asset.name}${
    scale === 1 ? "" : `@${scale}x`
  }.${asset.type}`

const androidResourceId = (asset: PackagerAsset): string =>
  `${basePath(asset)}/${asset.name}`
    .toLowerCase()
    .replace(/\//g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/^(?:assets|assetsunstable_path)_/, "")

const androidResourceFolder = (asset: PackagerAsset, scale: number): string => {
  if (!drawableTypes[asset.type]) return "raw"
  const suffix = androidScales[String(scale)] ??
    `${Math.round(scale * 160)}dpi`
  return `drawable-${suffix}`
}

const localScriptDir = (
  scriptURL: string | null | undefined
): string | null => {
  if (scriptURL == null || scriptURL.startsWith("assets://")) return null
  const dir = scriptURL.slice(0, scriptURL.lastIndexOf("/") + 1)
  return dir.includes("://") ? dir : `file://${dir}`
}

const deviceScale = (): number => {
  const dims = getTurboModule<{
    readonly getConstants: () => {
      readonly Dimensions?: {
        readonly window?: { readonly scale?: number }
        readonly windowPhysicalPixels?: { readonly scale?: number }
      }
    }
  }>("DeviceInfo")?.getConstants()?.Dimensions
  return (dims?.window ?? dims?.windowPhysicalPixels)?.scale ?? 1
}

const scriptURL = (): string | null | undefined =>
  getTurboModule<{
    readonly getConstants: () => { readonly scriptURL?: string | null }
  }>("SourceCode")?.getConstants()?.scriptURL

const resolvePackagerAsset = (
  asset: PackagerAsset,
  os: string
): ResolvedAsset => {
  const scale = pickScale(asset.scales, deviceScale())
  const url = scriptURL()
  const serverURL = url?.match(/^https?:\/\/.*?\//)?.[0] ?? null
  let uri: string
  if (serverURL !== null && !(asset.type === "xml" && os === "android")) {
    uri = `${serverURL}${
      scaledPath(asset, scale)
    }?platform=${os}&hash=${asset.hash}`
  } else {
    const bundleDir = localScriptDir(url)
    const resolver = asset.resolver ??
      (os === "android" ? "android" : "generic")
    if (resolver === "android") {
      uri = bundleDir !== null && bundleDir.startsWith("file://")
        ? `${bundleDir}${androidResourceFolder(asset, scale)}/${
          androidResourceId(asset)
        }.${asset.type}`
        : androidResourceId(asset)
    } else {
      uri = `${bundleDir ?? "file://"}${
        scaledPath(asset, scale).replace(/\.\.\//g, "_")
      }`
    }
  }
  const resolved: {
    __packager_asset: true
    uri: string
    width?: number
    height?: number
    scale: number
  } = { __packager_asset: true, uri, scale }
  if (asset.width !== undefined) resolved.width = asset.width
  if (asset.height !== undefined) resolved.height = asset.height
  return resolved
}

let cache: Map<string, readonly [ResolvedAsset]> | undefined

export const getAsset = (id: number): PackagerAsset | undefined =>
  getAssetByID(id)

export const resolveAsset = (
  id: number,
  os: string
): readonly [ResolvedAsset] | undefined => {
  const key = `${os}:${id}`
  const cached = cache?.get(key)
  if (cached !== undefined) return cached
  const asset = getAssetByID(id)
  if (asset === undefined) return undefined
  const out = [resolvePackagerAsset(asset, os)] as const
  ;(cache ??= new Map()).set(key, out)
  return out
}
