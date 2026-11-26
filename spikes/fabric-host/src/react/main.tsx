// The measurement scripts read these logs from logcat.
// oxlint-disable no-console
/**
 * The same benchmark on stock React Native, for comparison on the same
 * device and build.
 */
import { memo, useLayoutEffect, useReducer } from "react"
import { AppRegistry, Pressable, ScrollView, Text, View } from "react-native"
import { now, runBench } from "../bench-runner.ts"
import { type Msg, reduce, type Row as RowData } from "../rows.ts"

let dispatchRef: ((message: Msg) => void) | undefined
let onCommit: (() => void) | undefined
let firstCommit = true
declare const global: any

const Row = memo((
  { row, selected, dispatch }: {
    row: RowData
    selected: boolean
    dispatch: (m: Msg) => void
  }
) => (
  <View
    style={{
      flexDirection: "row",
      padding: 6,
      backgroundColor: selected ? "#fde68a" : undefined
    }}
  >
    <Text style={{ width: 60 }}>{String(row.id)}</Text>
    <Text
      style={{ flex: 1 }}
      onPress={() => dispatch({ _tag: "Select", id: row.id })}
    >
      {row.label}
    </Text>
    <Text onPress={() => dispatch({ _tag: "Remove", id: row.id })}>x</Text>
  </View>
))

const Button = ({ title, onPress }: { title: string; onPress: () => void }) => (
  <Pressable
    style={{ backgroundColor: "#2563eb", padding: 8, borderRadius: 4 }}
    onPress={onPress}
  >
    <Text style={{ color: "white" }}>{title}</Text>
  </Pressable>
)

const App = () => {
  const [model, dispatch] = useReducer(reduce, {
    rows: [],
    selected: 0,
    nextId: 1
  })
  dispatchRef = dispatch
  useLayoutEffect(() => {
    if (firstCommit) {
      firstCommit = false
      console.log(
        `SPIKE_STARTUP ${
          JSON.stringify({
            bundleStartToFirstCommitMs: now() - global.__BUNDLE_START_TIME__
          })
        }`
      )
    }
    onCommit?.()
  })
  return (
    <View style={{ flex: 1, backgroundColor: "white", paddingTop: 48 }}>
      <View
        style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, padding: 6 }}
      >
        <Button
          title="Create 1,000"
          onPress={() => dispatch({ _tag: "Run" })}
        />
        <Button
          title="Create 10,000"
          onPress={() => dispatch({ _tag: "RunLots" })}
        />
        <Button
          title="Append 1,000"
          onPress={() => dispatch({ _tag: "Add" })}
        />
        <Button
          title="Update 10th"
          onPress={() => dispatch({ _tag: "Update" })}
        />
        <Button title="Swap" onPress={() => dispatch({ _tag: "SwapRows" })} />
        <Button title="Clear" onPress={() => dispatch({ _tag: "Clear" })} />
      </View>
      <ScrollView style={{ flex: 1 }}>
        {model.rows.map((row) => (
          <Row
            key={row.id}
            row={row}
            selected={row.id === model.selected}
            dispatch={dispatch}
          />
        ))}
      </ScrollView>
    </View>
  )
}

AppRegistry.registerComponent("main", () => App)

setTimeout(() => {
  runBench((message) =>
    new Promise<void>((resolve) => {
      onCommit = () => {
        onCommit = undefined
        resolve()
      }
      dispatchRef!(message as Msg)
    })
  )
}, 0)
