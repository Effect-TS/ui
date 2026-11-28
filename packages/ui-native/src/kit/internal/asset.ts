import { getAssetByID, type PackagerAsset } from "react-native/asset-registry"
import type { Device } from "../../Native.ts"

export { getAssetByID }

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

const deviceScale = (device: Device): number => {
  const dims = device.module("DeviceInfo")?.getConstants()?.Dimensions
  return (dims?.window ?? dims?.windowPhysicalPixels)?.scale ?? 1
}

const resolvePackagerAsset = (
  asset: PackagerAsset,
  device: Device
): ResolvedAsset => {
  const os = device.os
  const scale = pickScale(asset.scales, deviceScale(device))
  const url: string | null | undefined = device.module("SourceCode")
    ?.getConstants()?.scriptURL
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
  return {
    __packager_asset: true,
    uri,
    width: asset.width,
    height: asset.height,
    scale
  }
}

// Asset URLs and scales depend on the device. Asset ids count up from 1.
const caches = new WeakMap<Device, Array<ResolvedAsset | undefined>>()

export const resolveAsset = (
  id: number,
  device: Device
): ResolvedAsset | undefined => {
  let cache = caches.get(device)
  if (cache === undefined) caches.set(device, cache = [])
  const cached = cache[id]
  if (cached !== undefined) return cached
  const asset = getAssetByID(id)
  return asset && (cache[id] = resolvePackagerAsset(asset, device))
}
