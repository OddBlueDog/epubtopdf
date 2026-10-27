import type { StyleRule } from "@/core/css/stylesheet";
import { parseStylesheet } from "@/core/css/stylesheet";

/**
 * The browser default stylesheet, trimmed to what a book uses. Publisher CSS is written
 * against these defaults, so we cascade it on top exactly as a reading system would.
 */
const USER_AGENT_CSS = `
  html, body, div, p, section, article, aside, main, header, footer, nav, figure, figcaption,
  address, blockquote, center, details, summary, dl, dt, dd, ol, ul, hgroup, fieldset, form,
  h1, h2, h3, h4, h5, h6, pre, table, caption, hr { display: block; }
  li { display: list-item; }
  head, script, style, title, meta, link, template, noscript, [hidden] { display: none; }

  p, dl, figure, blockquote { margin: 1em 0; }
  blockquote, figure { margin-left: 40px; margin-right: 40px; }
  dd { margin-left: 40px; }
  ul, ol { margin: 1em 0; padding-left: 40px; }
  ul ul, ol ol, ul ol, ol ul { margin-top: 0; margin-bottom: 0; }
  ol { list-style-type: decimal; }
  ul ul { list-style-type: circle; }
  ul ul ul { list-style-type: square; }

  h1 { font-size: 2em; margin: 0.67em 0; font-weight: bold; }
  h2 { font-size: 1.5em; margin: 0.83em 0; font-weight: bold; }
  h3 { font-size: 1.17em; margin: 1em 0; font-weight: bold; }
  h4 { margin: 1.33em 0; font-weight: bold; }
  h5 { font-size: 0.83em; margin: 1.67em 0; font-weight: bold; }
  h6 { font-size: 0.67em; margin: 2.33em 0; font-weight: bold; }

  b, strong, th, dt { font-weight: bold; }
  i, em, cite, dfn, var, address { font-style: italic; }
  pre, code, kbd, samp, tt { font-family: monospace; }
  pre { white-space: pre; margin: 1em 0; }
  u, ins { text-decoration: underline; }
  s, strike, del { text-decoration: line-through; }
  sup { vertical-align: super; font-size: smaller; }
  sub { vertical-align: sub; font-size: smaller; }
  small { font-size: smaller; }
  big { font-size: larger; }
  center, caption { text-align: center; }
  th { text-align: left; }
  hr { margin: 0.5em 0; }
`;

export const USER_AGENT_RULES: readonly StyleRule[] = parseStylesheet(USER_AGENT_CSS).rules;
