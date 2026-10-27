import type { AnchorId, Block } from "@/core/document/ast";
import type { ResolvedHref } from "@/core/epub/paths";

/**
 * Maps `(file, fragment)` pairs onto short, unique destination ids.
 * Only files that are part of the rendered spine can be link targets.
 */
export type AnchorRegistry = {
  readonly forFile: (path: string) => AnchorId | undefined;
  readonly forFragment: (path: string, fragment: string) => AnchorId | undefined;
  readonly resolve: (target: ResolvedHref) => AnchorId | undefined;
  /** Marks a destination as emitted. Returns `false` if it was already claimed (duplicate id). */
  readonly claim: (anchor: AnchorId) => boolean;
  readonly isDefined: (anchor: AnchorId) => boolean;
};

const toAnchor = (value: string): AnchorId =>
  // Branded type: this module is the single place where anchor ids are minted.
  value as AnchorId; // oxlint-disable-line typescript/no-unsafe-type-assertion

export const createAnchorRegistry = (spinePaths: readonly string[]): AnchorRegistry => {
  const fileIndex = new Map(spinePaths.map((path, index) => [path.toLowerCase(), index]));
  const defined = new Set<AnchorId>();

  const forFile = (path: string): AnchorId | undefined => {
    const index = fileIndex.get(path.toLowerCase());
    return index === undefined ? undefined : toAnchor(`f${index}`);
  };

  const forFragment = (path: string, fragment: string): AnchorId | undefined => {
    const file = forFile(path);
    return file === undefined ? undefined : toAnchor(`${file}#${fragment}`);
  };

  return {
    forFile,
    forFragment,
    resolve: (target) =>
      target.fragment === undefined
        ? forFile(target.path)
        : forFragment(target.path, target.fragment),
    claim: (anchor) => {
      if (defined.has(anchor)) {
        return false;
      }
      defined.add(anchor);
      return true;
    },
    isDefined: (anchor) => defined.has(anchor),
  };
};

/** Claims every anchor in a block tree, dropping duplicates so each destination id is unique. */
export const claimAnchors = (blocks: readonly Block[], registry: AnchorRegistry): Block[] =>
  blocks.map((block): Block => {
    const anchors = block.anchors.filter(registry.claim);
    switch (block.kind) {
      case "list":
        return {
          ...block,
          anchors,
          items: block.items.map((item) => claimAnchors(item, registry)),
        };
      case "quote":
        return { ...block, anchors, children: claimAnchors(block.children, registry) };
      case "heading":
      case "paragraph":
      case "code":
      case "image":
      case "rule":
      case "table":
        return { ...block, anchors };
    }
  });
