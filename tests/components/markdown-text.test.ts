import { describe, expect, test } from "bun:test";

import { parseInlineMarkdown, parseMarkdownLine } from "../../src/components/markdown-text";

describe("parseInlineMarkdown", () => {
  test("parses bold markers into text and bold tokens", () => {
    const tokens = parseInlineMarkdown("- **Brand:** VISA");
    expect(tokens).toEqual([
      { type: "text", value: "- " },
      { type: "bold", value: "Brand:" },
      { type: "text", value: " VISA" },
    ]);
  });

  test("returns plain text token when markdown is unmatched", () => {
    const tokens = parseInlineMarkdown("**unclosed bold");
    expect(tokens).toEqual([{ type: "text", value: "**unclosed bold" }]);
  });
});

describe("parseMarkdownLine", () => {
  test("parses heading prefix", () => {
    const line = parseMarkdownLine("## BIN Lookup Results");
    expect(line).toEqual({
      prefix: "",
      body: "BIN Lookup Results",
      isHeading: true,
      isBlank: false,
    });
  });

  test("parses bullet prefixes", () => {
    const line = parseMarkdownLine("- **Issuer:** Bank of America");
    expect(line).toEqual({
      prefix: "- ",
      body: "**Issuer:** Bank of America",
      isHeading: false,
      isBlank: false,
    });
  });

  test("detects blank lines", () => {
    const line = parseMarkdownLine("   ");
    expect(line).toEqual({
      prefix: "",
      body: "",
      isHeading: false,
      isBlank: true,
    });
  });
});
