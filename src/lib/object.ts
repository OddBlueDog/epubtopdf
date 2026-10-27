/**
 * `Object.entries` keeps no key information. For records whose keys are a closed union
 * (all of ours are `as const satisfies Record<…>`), the entries are exactly `[K, V]`.
 */
export const typedEntries = <K extends string, V>(record: Readonly<Record<K, V>>): [K, V][] =>
  Object.entries(record) as [K, V][]; // oxlint-disable-line typescript/no-unsafe-type-assertion
