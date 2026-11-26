/**
 * Requires option `K` when its type isn't `Default`, what the runtime uses
 * when it's absent. An option that may be absent then can't type the
 * definition with a Schema it doesn't get. Public declarations
 * reference it, so it must survive `stripInternal`.
 */
export type Given<K extends string, A, Default> = [A] extends [Default]
  ? [Default] extends [A] ? {} : { readonly [_ in K]: A }
  : { readonly [_ in K]: A }
