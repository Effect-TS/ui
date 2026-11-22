[![pkg.pr.new](https://img.shields.io/badge/pkg.pr.new-Effect--TS%2Fui-black)](https://pkg.pr.new/~/Effect-TS/ui)

# Effect UI

Frontend packages for [Effect](https://github.com/Effect-TS/effect).

| Package                             | Description                                                                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| [`@effect/ui`](packages/ui)         | A frontend framework whose apps are composed with Layers, with `@effect/ui/html` for the DOM, routing, server rendering and hydration |
| [`@effect/ui-kit`](packages/ui-kit) | The component library for `@effect/ui`. It has no components yet                                                                      |

Both packages are experimental.

## Snapshots

Every pull request and every push to `main` publishes snapshot builds of both packages to [pkg.pr.new](https://pkg.pr.new/~/Effect-TS/ui). Install one with the commit's short SHA:

```sh
pnpm add https://pkg.pr.new/Effect-TS/ui/@effect/ui@<sha>
```

## Examples

`examples/` holds apps ported from [Foldkit's examples](https://github.com/devinjameson/foldkit/tree/main/examples). Each one is a private workspace package that `pnpm check`, `pnpm lint` and `pnpm test` cover. Run one with Vite:

```sh
pnpm --filter auth dev
pnpm --filter interrupting-commands dev
pnpm --filter routing dev
pnpm --filter snake dev
```

## Development

The repository is a pnpm workspace, set up like the [Effect monorepo](https://github.com/Effect-TS/effect). `nix develop` (or direnv) gives you Node and pnpm.

```sh
pnpm install
pnpm check        # type check sources, tests and docs
pnpm test         # run the Vitest suites
pnpm test-types   # run the TSTyche type tests
pnpm doctest      # run the examples in the JSDoc
pnpm lint         # oxlint and dprint
pnpm codegen      # regenerate the index.ts barrels
pnpm ai-docgen    # regenerate LLMS.md from ai-docs/src
pnpm build        # build every package
```

Add a changeset (`pnpm changeset`) to a pull request that changes a published package.

`packages/tools` holds private copies of the Effect monorepo's lint plugin, barrel codegen, JSDoc checker and AI docs generator, which aren't published to npm.
