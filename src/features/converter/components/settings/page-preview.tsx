import { memo } from "react";

import { pageGeometry } from "@/core/pdf/page-geometry";
import type { ConversionSettings } from "@/core/settings";
import { effectiveBaseFontSize, PAGE_SIZES, usesCustomMargins } from "@/core/settings";

const PARAGRAPH_LINES = [5, 3, 6, 4, 5, 2, 6, 4] as const;
const MAX_LINES = 80;

/** Deterministic ragged line widths for the left-aligned preview. */
const raggedWidth = (index: number): number => 0.82 + ((index * 37) % 17) / 100;

/**
 * A to-scale schematic of a page: proportions, margins, text size, line spacing and alignment.
 * Drawn in PDF points, so it is exact by construction.
 */
export const PagePreview = memo(({ settings }: { readonly settings: ConversionSettings }) => {
  const geometry = pageGeometry(settings);
  const [left, top] = geometry.margins;
  const { contentWidth, contentHeight } = geometry;
  const size = effectiveBaseFontSize(settings);
  const lineStep = size * settings.lineHeight;
  const barHeight = size * 0.42;
  const headingHeight = size * 1.85 * 0.5;
  const bodyTop = top + headingHeight + size * 2.2;

  const bars: { readonly x: number; readonly y: number; readonly width: number }[] = [];
  let y = bodyTop;
  let paragraph = 0;
  let lineInParagraph = 0;
  while (y + barHeight <= top + contentHeight && bars.length < MAX_LINES) {
    const linesInParagraph = PARAGRAPH_LINES[paragraph % PARAGRAPH_LINES.length] ?? 4;
    const isLast = lineInParagraph === linesInParagraph - 1;
    const width = isLast
      ? contentWidth * (0.35 + ((paragraph * 23) % 40) / 100)
      : settings.textAlign === "justify"
        ? contentWidth
        : contentWidth * raggedWidth(bars.length);
    bars.push({ x: left, y, width });
    y += lineStep;
    lineInParagraph += 1;
    if (isLast) {
      paragraph += 1;
      lineInParagraph = 0;
      y += size * 0.6;
    }
  }

  const page = PAGE_SIZES[settings.pageSize];
  return (
    <figure className="flex flex-col items-center gap-2">
      <svg
        viewBox={`0 0 ${geometry.width} ${geometry.height}`}
        className="h-56 w-auto max-w-full rounded-sm bg-white shadow-md ring-1 ring-black/5 dark:bg-zinc-100"
        aria-hidden="true"
      >
        <rect
          x={left}
          y={top}
          width={contentWidth}
          height={contentHeight}
          className="fill-none stroke-sky-500/40"
          strokeDasharray="4 4"
          strokeWidth={1}
        />
        <rect
          x={left}
          y={top}
          width={contentWidth * 0.55}
          height={headingHeight}
          rx={2}
          className="fill-zinc-800"
        />
        {bars.map((bar) => (
          <rect
            key={bar.y}
            x={bar.x}
            y={bar.y}
            width={bar.width}
            height={barHeight}
            rx={barHeight / 2}
            className="fill-zinc-400"
          />
        ))}
        {settings.pageNumbers ? (
          <rect
            x={geometry.width / 2 - size * 0.5}
            y={geometry.height - geometry.margins[3] / 2 - barHeight / 2}
            width={size}
            height={barHeight}
            rx={barHeight / 2}
            className="fill-zinc-400"
          />
        ) : null}
      </svg>
      <figcaption className="text-xs text-muted-foreground">
        {page.label} · {page.description}
        {usesCustomMargins(settings) ? null : " · book margins"}
      </figcaption>
    </figure>
  );
});
PagePreview.displayName = "PagePreview";
