# EPUB to PDF

**[▶ Open the app: epubtopdf.pages.dev](https://epubtopdf.pages.dev/)**

Convert EPUB e-books to PDF entirely in the browser — no uploads, no server.

- **Publisher layout (default):** keeps the book's own fonts (including obfuscated embedded
  fonts), CSS sizes, indents, spacing, alignment and colours via a real CSS cascade.
- **Custom layout:** re-typesets the book with your typeface, size, spacing and alignment.
- **Print exact copy:** renders the original XHTML/CSS with the browser engine in a sandboxed
  iframe and opens the print dialog (Save as PDF) for pixel-exact output.
- Batch conversion in Web Workers, per-file download, ZIP of selected PDFs, linked contents
  page, PDF bookmarks, page numbers, cover page and image optimisation.

## Scripts

| Command         | What it does                                           |
| --------------- | ------------------------------------------------------ |
| `pnpm dev`      | Vite dev server                                        |
| `pnpm build`    | Typecheck + production build (with a strict CSP)       |
| `pnpm test`     | Vitest unit, property-based (fast-check) and e2e tests |
| `pnpm coverage` | Tests with V8 coverage                                 |
| `pnpm lint`     | Oxlint, type-aware, warnings are errors                |
| `pnpm format`   | Oxfmt (imports and Tailwind classes sorted)            |
| `pnpm check`    | Format check, lint, typecheck and tests                |

## Architecture

```
src/core/            framework-free, runs in the worker (and in Node for tests)
  epub/              unzip, OPF, TOC (nav/NCX), paths, font de-obfuscation
  css/               value parsing, stylesheets, cascade, user-agent defaults
  document/          XHTML + computed styles → renderer-agnostic book AST
  images/            sniffing, normalisation, RGB PNG encoder
  pdf/               themes, fonts, document definition, pdfmake adapter
  print/             builds the "exact copy" HTML document
  convert.ts         the pipeline, composed from the stages above
src/worker/          worker entry, message protocol, bundled font assets
src/features/converter/   React UI: queue, settings, job list, print
```

## Supply chain

`pnpm-workspace.yaml` enforces a 7-day minimum release age, publish-trust no-downgrade,
no exotic transitive sources and explicit approval for install scripts. `pdfmake` carries a
small reviewed patch (`patches/`) for justification spacing and layout-cache performance.
