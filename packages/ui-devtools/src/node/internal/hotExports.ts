// Finds a module's components so the Vite plugin can accept just those exports.
// A guess either way is safe: a listed non-component and an unlisted component
// both end in a reload.

interface Node {
  readonly type: string
  readonly [key: string]: any
}

const named = (node: Node | null | undefined, name: string): boolean =>
  node?.type === "Identifier" && node.name === name

const calls = (node: Node | null | undefined, names: ReadonlyArray<string>) =>
  node?.type === "CallExpression" &&
  node.callee.type === "MemberExpression" &&
  names.some((name) => named(node.callee.property, name))

const isDefinition = (node: Node | null | undefined): boolean =>
  calls(node, ["component", "define"])

const isComponent = (
  node: Node | null | undefined,
  consts: ReadonlyMap<string, Node>
): boolean => {
  if (calls(node, ["provide"])) return true
  if (!calls(node, ["make", "pipe"])) return false
  const target = node!.callee.object as Node
  if (named(node!.callee.property, "pipe")) {
    return node!.arguments.some((arg: Node) => calls(arg, ["provide"]))
  }
  return isDefinition(target) ||
    (target.type === "Identifier" && isDefinition(consts.get(target.name)))
}

/** @internal The export and local name of each exported component. */
export const find = (
  program: Node
): ReadonlyArray<readonly [string, string]> => {
  const consts = new Map<string, Node>()
  const exportedLocals = new Map<string, string>()
  for (const statement of program.body as ReadonlyArray<Node>) {
    const declaration = statement.type === "ExportNamedDeclaration"
      ? statement.declaration as Node | null
      : statement
    if (declaration?.type === "VariableDeclaration") {
      for (
        const declarator of declaration.declarations as ReadonlyArray<Node>
      ) {
        if (declarator.id.type !== "Identifier" || !declarator.init) continue
        consts.set(declarator.id.name, declarator.init)
        if (declaration !== statement) {
          exportedLocals.set(declarator.id.name, declarator.id.name)
        }
      }
    }
    if (statement.type === "ExportNamedDeclaration" && !statement.source) {
      for (const specifier of statement.specifiers as ReadonlyArray<Node>) {
        const exported = specifier.exported
        exportedLocals.set(
          exported.type === "Identifier" ? exported.name : exported.value,
          specifier.local.name
        )
      }
    }
  }
  const exported: Array<readonly [string, string]> = []
  for (const [name, local] of exportedLocals) {
    if (isComponent(consts.get(local), consts)) exported.push([name, local])
  }
  return exported
}

/** @internal */
export const footer = (
  exported: ReadonlyArray<readonly [string, string]>
): string => {
  const names = JSON.stringify(exported.map(([name]) => name))
  return [
    "",
    "if (import.meta.hot) {",
    "  const __effectUiFirst = import.meta.hot.data[\"@effect/ui\"] ??= {};",
    ...exported.map(([name, local]) =>
      `  __effectUiFirst[${JSON.stringify(name)}] ??= ${local};`
    ),
    `  import.meta.hot.acceptExports(${names}, (next) => {`,
    "    if (next === undefined) return;",
    "    const swap = globalThis[Symbol.for(\"@effect/ui/hot/swap\")];",
    `    if (swap?.(__effectUiFirst, next, ${names}) === true) return;`,
    "    globalThis[Symbol.for(\"@effect/ui/hot\")]?.();",
    "    location.reload();",
    "  });",
    "}",
    ""
  ].join("\n")
}
