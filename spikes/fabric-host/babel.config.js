// babel-preset-expo runs the Flow type stripper on every file, which rejects
// TypeScript's `declare` class fields in @effect/ui. Strip TypeScript first.
module.exports = (api) => {
  api.cache(true)
  return {
    // The preset the stock project uses implicitly, which ships inside `expo`.
    presets: [
      require.resolve("babel-preset-expo", {
        paths: [require.resolve("expo/package.json")]
      })
    ],
    overrides: [{
      test: (file) => file !== undefined && file.endsWith(".ts"),
      plugins: [["@babel/plugin-transform-typescript", {
        allowDeclareFields: true,
        allowNamespaces: true
      }]]
    }]
  }
}
