import { Array as Arr } from "effect"

const SEARCH_HISTORY_LIMIT = 5

export const addSearchToHistory = (history: ReadonlyArray<string>, searchText: string): ReadonlyArray<string> =>
  searchText === "" ? history : Arr.take(Arr.dedupe([searchText, ...history]), SEARCH_HISTORY_LIMIT)
