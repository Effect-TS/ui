/**
 * `effect/SchemaAST` functions that `effect` exports at runtime but marks
 * `@internal`, so its published declarations leave them out. This module
 * gives them their types back.
 *
 * @internal
 */
import * as SchemaAST from "effect/SchemaAST"

interface Internals {
  readonly replaceEncoding: <A extends SchemaAST.AST>(ast: A, encoding: ReadonlyArray<SchemaAST.Link> | undefined) => A
  readonly replaceContextLastLink: <A extends SchemaAST.AST>(ast: A, context: SchemaAST.Context) => A
  readonly mapLink: (link: SchemaAST.Link, f: (ast: SchemaAST.AST) => SchemaAST.AST) => SchemaAST.Link
  readonly getIndexSignatureKeys: (
    input: { readonly [x: PropertyKey]: unknown },
    parameter: SchemaAST.IndexSignature["parameter"]
  ) => ReadonlyArray<PropertyKey>
}

const internals = SchemaAST as unknown as Internals

/** @internal */
export const replaceEncoding = internals.replaceEncoding

/** @internal */
export const replaceContextLastLink = internals.replaceContextLastLink

/** @internal */
export const mapLink = internals.mapLink

/** @internal */
export const getIndexSignatureKeys = internals.getIndexSignatureKeys

/**
 * Rebuilds a node's children with `f`, for the nodes that have children.
 *
 * @internal
 */
export const recur = (ast: SchemaAST.AST, f: (ast: SchemaAST.AST) => SchemaAST.AST): SchemaAST.AST =>
  "recur" in ast ? (ast as { recur(f: (ast: SchemaAST.AST) => SchemaAST.AST): SchemaAST.AST }).recur(f) : ast
