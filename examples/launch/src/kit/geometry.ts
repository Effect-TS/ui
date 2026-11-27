import {
  ListNavigation,
  Positioning,
  Typeahead,
  VirtualKeyboard
} from "@effect/ui-kit"

// The values behind the Positioning, VirtualKeyboard, ListNavigation and
// Typeahead tiles, worked out by the kit's own pure functions. None of
// these modules draws anything, so the tiles draw what these return.

/** The box the Positioning tile places in, in pixels. */
export const stage = { width: 72, height: 44 }

const anchorSize = { width: 18, height: 10 }
const floatingSize = { width: 36, height: 10 }

const options = Positioning.resolveOptions(
  { sideOffset: 3, collisionPadding: 0 },
  { side: "bottom" }
)

const boundary = { x: 0, y: 0, ...stage }

/**
 * Where the Positioning tile draws its anchor and the box placed against
 * it. At rest the anchor sits near the top and the box fits below it.
 * Playing, the anchor moves near the bottom edge, and `place` flips the box
 * above it.
 */
export const floating = (on: boolean) => {
  const anchor = {
    x: (stage.width - anchorSize.width) / 2,
    y: on ? 30 : 6,
    ...anchorSize
  }
  const placed = Positioning.place({
    anchor,
    popup: floatingSize,
    arrow: null,
    boundary,
    anchorClip: boundary,
    rtl: false,
    options
  })
  return {
    anchor,
    box: { x: placed.x, y: placed.y, ...floatingSize },
    side: placed.side
  }
}

// A phone-sized viewport with a text field focused.
const phone: VirtualKeyboard.Sample = {
  layoutWidth: 390,
  layoutHeight: 760,
  visualHeight: 760,
  visualTop: 0,
  scale: 1,
  smallViewportHeight: 760,
  android: false,
  focused: true
}

/**
 * The share of the screen the software keyboard covers, from 0 to 1, as
 * `VirtualKeyboard.step` works it out from a phone's viewport sizes. At
 * rest no keyboard is up. Playing, the visual viewport shrinks by a
 * keyboard's height.
 */
export const keyboardCover = (on: boolean): number => {
  const sample = on ? { ...phone, visualHeight: 470 } : phone
  const { band } = VirtualKeyboard.step(
    VirtualKeyboard.initialState(phone),
    sample
  )
  return band === null ? 0 : band.inset / phone.layoutHeight
}

export const listItems = [
  { id: "a", width: 42, disabled: false },
  { id: "b", width: 32, disabled: true },
  { id: "c", width: 48, disabled: false }
] as const

/**
 * The highlighted item's id in the ListNavigation tile, chosen by
 * `ListNavigation.available` and `ListNavigation.target`. At rest the
 * first item is active. Playing, ArrowDown skips the disabled middle
 * item and lands on the last.
 */
export const listActive = (on: boolean): string => {
  const enabled = listItems.filter(ListNavigation.available)
  const index = (on
    ? ListNavigation.target("ArrowDown", {
      at: 0,
      last: enabled.length - 1,
      orientation: "vertical",
      loop: "wrap"
    })
    : 0) ?? 0
  return enabled[index]!.id
}

export const typeaheadItems = [
  { label: "Alpha" },
  { label: "Beta" },
  { label: "Gamma" }
] as const

/** The key the Typeahead tile types. */
export const typeaheadKey = "g"

/**
 * The matched item's index in the Typeahead tile, computed by
 * `Typeahead.step`. At rest nothing matches. Playing, typing
 * `typeaheadKey` jumps straight to "Gamma".
 */
export const typeaheadMatch = (on: boolean): number =>
  on
    ? Typeahead.step(Typeahead.initial, typeaheadKey, typeaheadItems)
      .index
    : -1
