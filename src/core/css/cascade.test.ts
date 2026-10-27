import { fc, test } from "@fast-check/vitest";
import type { Selector } from "css-what";
import { parse as parseSelector } from "css-what";
import { isTag } from "domhandler";
import { describe, expect, it } from "vitest";

import type { StyleResolver } from "@/core/css/cascade";
import { createStyleResolver, ruleKey } from "@/core/css/cascade";
import type { ComputedStyle, StyleEnvironment } from "@/core/css/computed-style";
import { rootStyle } from "@/core/css/computed-style";
import { parseInlineStyle, parseStylesheet, specificityOf } from "@/core/css/stylesheet";
import { USER_AGENT_RULES } from "@/core/css/user-agent";
import type { Element } from "@/core/xml/dom";
import { byLocalName, findAll, findFirst, parseXhtml } from "@/core/xml/dom";

const ENVIRONMENT: StyleEnvironment = { rootFontSize: 12, defaultFontFamily: "serif" };

const resolverFor = (css: string): StyleResolver =>
  createStyleResolver(
    [
      { origin: "user-agent", rules: USER_AGENT_RULES },
      { origin: "author", rules: parseStylesheet(css).rules },
    ],
    ENVIRONMENT,
  );

/** Computes the style of the first element matching `tag`, cascading from the root. */
const styleOf = (html: string, css: string, tag: string): ComputedStyle => {
  const resolve = resolverFor(css);
  const document = parseXhtml(`<html><body>${html}</body></html>`);
  const target = findFirst(document, byLocalName(tag));
  if (target === undefined) {
    throw new Error(`no <${tag}>`);
  }
  const chain: Element[] = [];
  for (let node: Element | undefined = target; node !== undefined;) {
    chain.unshift(node);
    node = node.parent !== null && isTag(node.parent) ? node.parent : undefined;
  }
  return chain.reduce((parent, element) => resolve(element, parent), rootStyle(ENVIRONMENT));
};

const firstSelector = (selector: string): Selector[] => {
  const [tokens] = parseSelector(selector);
  if (tokens === undefined) {
    throw new Error(`invalid selector ${selector}`);
  }
  return tokens;
};

describe("specificity", () => {
  it.each([
    ["p", [0, 0, 1]],
    [".a", [0, 1, 0]],
    ["#x", [1, 0, 0]],
    ["div p.a:first-child", [0, 2, 2]],
    ["a[href]", [0, 1, 1]],
    ["*", [0, 0, 0]],
  ])("%s → %j", (selector, expected) => {
    expect(specificityOf(firstSelector(selector))).toEqual(expected);
  });

  it("indexes rules by their rightmost compound selector", () => {
    expect(ruleKey(firstSelector("div.chapter p.first"))).toBe(".first");
    expect(ruleKey(firstSelector("section > #intro"))).toBe("#intro");
    expect(ruleKey(firstSelector("ul li"))).toBe("li");
    expect(ruleKey(firstSelector(".a *"))).toBe("*");
  });
});

describe("cascade", () => {
  it("applies user-agent defaults", () => {
    const h1 = styleOf("<h1>t</h1>", "", "h1");
    expect(h1.fontSize).toBe(24);
    expect(h1.fontWeight).toBe(700);
    expect(styleOf("<em>t</em>", "", "em").italic).toBe(true);
  });

  it("lets more specific selectors win regardless of order", () => {
    const style = styleOf(
      '<p class="a" id="x">t</p>',
      "#x { text-align: right } .a { text-align: center } p { text-align: left }",
      "p",
    );
    expect(style.textAlign).toBe("right");
  });

  it("lets later rules win at equal specificity", () => {
    expect(styleOf('<p class="a b">t</p>', ".a { color: red } .b { color: blue }", "p").color).toBe(
      "#0000ff",
    );
  });

  it("honours !important over specificity and inline styles", () => {
    const style = styleOf(
      '<p id="x" style="color: green">t</p>',
      "p { color: red !important } #x { color: blue }",
      "p",
    );
    expect(style.color).toBe("#ff0000");
  });

  it("puts inline styles above author rules", () => {
    expect(styleOf('<p id="x" style="color: green">t</p>', "#x { color: blue }", "p").color).toBe(
      "#008000",
    );
  });

  it("matches descendant and child combinators", () => {
    const css = "div.chapter p { text-indent: 2em } body > div { font-size: 20px }";
    const style = styleOf('<div class="chapter"><p>t</p></div>', css, "p");
    expect(style.textIndent).toBeCloseTo(2 * 15);
    expect(style.fontSize).toBeCloseTo(15);
  });

  it("inherits typography but not boxes", () => {
    const style = styleOf(
      "<div><span>t</span></div>",
      "div { font-style: italic; margin: 1em; color: #333 }",
      "span",
    );
    expect(style.italic).toBe(true);
    expect(style.color).toBe("#333333");
    expect(style.margin).toEqual([0, 0, 0, 0]);
  });

  it("resolves em margins against the element's own new font size", () => {
    const style = styleOf("<p>t</p>", "p { font-size: 2em; margin-top: 1em }", "p");
    expect(style.margin[0]).toBe(24);
  });

  it("ignores dynamic pseudo-classes and pseudo-elements", () => {
    const style = styleOf(
      "<p>t</p>",
      "p:hover { color: red } p::first-letter { color: blue } p:first-child { color: green }",
      "p",
    );
    expect(style.color).toBe("#008000");
  });

  it("hides elements with display:none and honours [hidden]", () => {
    expect(styleOf('<p class="h">t</p>', ".h { display: none }", "p").display).toBe("none");
    expect(styleOf("<p hidden>t</p>", "", "p").display).toBe("none");
  });

  test.prop([fc.string(), fc.string()])(
    "never throws on arbitrary CSS or inline styles",
    (css, inline) => {
      expect(() =>
        styleOf(`<p style="${inline.replaceAll('"', "")}">t</p>`, css, "p"),
      ).not.toThrow();
    },
  );
});

describe("parseStylesheet", () => {
  it("keeps screen/print media blocks and drops Kindle- or viewport-specific ones", () => {
    const sheet = parseStylesheet(
      "@media screen { .a { color: red } } @media amzn-kf8 { .b { color: red } } @media (max-width: 600px) { .c { color: red } } @media print, screen { .d { color: red } }",
    );
    expect(sheet.rules.map((rule) => rule.selector)).toEqual([".a", ".d"]);
  });

  it("extracts @font-face declarations and @import targets", () => {
    const sheet = parseStylesheet(`
      @import url("base.css");
      @import 'extra.css';
      @font-face { font-family: "Book Serif"; font-weight: bold; font-style: italic;
                   src: url(../fonts/serif-bi.woff2) format("woff2"), url('../fonts/serif-bi.ttf'); }
    `);
    expect(sheet.imports).toEqual(["base.css", "extra.css"]);
    expect(sheet.fontFaces).toEqual([
      {
        family: "book serif",
        sources: ["../fonts/serif-bi.woff2", "../fonts/serif-bi.ttf"],
        weight: 700,
        italic: true,
      },
    ]);
  });

  it("keeps declarations containing semicolons inside url()", () => {
    expect(parseInlineStyle("background: url(data:image/png;base64,AAAA); color: red")).toEqual([
      { property: "background", value: "url(data:image/png;base64,AAAA)", important: false },
      { property: "color", value: "red", important: false },
    ]);
  });

  test.prop([fc.string()])("never throws", (css) => {
    expect(() => parseStylesheet(css)).not.toThrow();
  });
});

describe("user-agent stylesheet", () => {
  it("parses completely", () => {
    expect(USER_AGENT_RULES.length).toBeGreaterThan(40);
  });

  it("styles every heading level", () => {
    const document = parseXhtml("<h1/><h2/><h3/><h4/><h5/><h6/>");
    const resolve = resolverFor("");
    const sizes = findAll(document, (element) => /^h\d$/u.test(element.name)).map(
      (heading) => resolve(heading, rootStyle(ENVIRONMENT)).fontSize,
    );
    expect(sizes).toEqual([...sizes].toSorted((a, b) => b - a));
  });
});

describe("@page rules", () => {
  it("collects unconditional @page declarations and skips :first/:left variants", () => {
    const sheet = parseStylesheet(
      "@page { margin: 5%; } @page :first { margin-top: 0; } @page { margin-bottom: 2em }",
    );
    expect(sheet.pageDeclarations).toEqual([
      { property: "margin", value: "5%", important: false },
      { property: "margin-bottom", value: "2em", important: false },
    ]);
  });
});
