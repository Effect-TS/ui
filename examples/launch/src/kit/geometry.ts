import { Positioning, VirtualKeyboard } from "@effect/ui-kit"

// The numbers behind the Positioning and VirtualKeyboard tiles, worked out
// by the kit's own pure functions. Neither module draws anything, so the
// tiles draw what these return.

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
