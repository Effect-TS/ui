---
"@effect/ui": minor
---

Checks that only catch an author's mistake now run in development only. Under the `production` export condition, the package's private `#dev` import resolves to empty checks, so their code and messages leave the bundle. Vite sets that condition for a production build. esbuild and Node set it only when given `--conditions=production`, and Webpack and Rollup are untested. Tests run with the checks on.

The checks that are now development-only:

- two sibling elements with one tag and key
- two children of one view, at any depth, at one path, including those in a slot's content and those a fallback shows
- one slot placed twice by an author's view and the closures it gives headless children
- a part applied after its owner closed or outside its view, and two layers of one element that set one event option other than `preventDefault`
- a feature child without `fallback`
- a slot placed by a root

In development these still fail the instance with a message, as before. In a production build, two siblings with one key no longer fail the instance: the diff pairs them by key, and the output for that render isn't specified. A feature child without `fallback` waits for its services with an empty placeholder, and a root that places a slot still fails, without the message.
