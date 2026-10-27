import type { Block } from "@/core/document/ast";

/**
 * Asserts a block's kind and narrows its type, so tests read straight through
 * without `if (block.kind === …)` branches around their expectations.
 */
export const narrow = <K extends Block["kind"]>(
  block: Block | undefined,
  kind: K,
): Extract<Block, { kind: K }> => {
  if (block?.kind !== kind) {
    throw new Error(
      `Expected a "${kind}" block, got ${block === undefined ? "nothing" : `"${block.kind}"`}`,
    );
  }
  return block as Extract<Block, { kind: K }>; // oxlint-disable-line typescript/no-unsafe-type-assertion
};
