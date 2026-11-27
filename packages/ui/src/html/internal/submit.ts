/**
 * Shared form-submission rules for the host and browser Router.
 *
 * @internal
 */

/**
 * Read an attribute through the form's own-window prototype, bypassing controls
 * named `getAttribute` that shadow the method on the form.
 *
 * @internal
 */
export const attribute = (form: Element, name: string): string | null =>
  (Object.getPrototypeOf(form) as Element).getAttribute.call(form, name)

/**
 * The submission's method in lowercase: the submitter's `formmethod`, else the
 * form's `method`. Anything but `post` and `dialog` is a GET, as in the
 * browser.
 *
 * @internal
 */
export const methodOf = (form: Element, submitter: Element | null): string =>
  (submitter?.getAttribute("formmethod") ?? attribute(form, "method") ?? "")
    .toLowerCase()
