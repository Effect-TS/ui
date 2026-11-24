/**
 * The `#dev` import under the `production` condition. The checks are empty, so their code and messages
 * stay out of a bundle whether or not its bundler folds `dev`.
 */
import type * as On from "./devOn.ts"

/** Whether the checks run. */
export const dev: boolean = false

/** Does nothing. */
export const checkKeys: typeof On.checkKeys = () => {}

/** Does nothing. */
export const checkPaths: typeof On.checkPaths = () => undefined

/** Does nothing. */
export const checkPlaced: typeof On.checkPlaced = () => {}

/** Does nothing. */
export const checkContent: typeof On.checkContent = () => {}

/** Does nothing. */
export const checkShown: typeof On.checkShown = () => {}

/** Does nothing. */
export const checkLayers: typeof On.checkLayers = () => {}

/** Does nothing. */
export const checkFallback: typeof On.checkFallback = () => {}

/** Does nothing. */
export const checkDeclarer: typeof On.checkDeclarer = () => {}
