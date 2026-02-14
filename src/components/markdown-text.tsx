import type { ReactNode } from "react";

import { useThemeTokens } from "../theme";
import { Box, Text } from "../ui";

export interface MarkdownTextProps {
  content: string;
  color: string;
}

export interface MarkdownInlineToken {
  type: "text" | "bold";
  value: string;
}

export interface MarkdownLine {
  prefix: string;
  body: string;
  isHeading: boolean;
  isBlank: boolean;
}

const BOLD_PATTERN = /\*\*([^*\n]+)\*\*/g;

export function parseInlineMarkdown(input: string): MarkdownInlineToken[] {
  if (input.length === 0) {
    return [{ type: "text", value: "" }];
  }

  const tokens: MarkdownInlineToken[] = [];
  let cursor = 0;

  for (const match of input.matchAll(BOLD_PATTERN)) {
    const raw = match[0];
    const boldValue = match[1];
    const index = match.index;
    if (index === undefined || boldValue === undefined) {
      continue;
    }

    if (index > cursor) {
      tokens.push({ type: "text", value: input.slice(cursor, index) });
    }

    tokens.push({ type: "bold", value: boldValue });
    cursor = index + raw.length;
  }

  if (cursor < input.length) {
    tokens.push({ type: "text", value: input.slice(cursor) });
  }

  return tokens.length > 0 ? tokens : [{ type: "text", value: input }];
}

export function parseMarkdownLine(line: string): MarkdownLine {
  if (line.trim().length === 0) {
    return { prefix: "", body: "", isHeading: false, isBlank: true };
  }

  const headingMatch = line.match(/^\s{0,3}(#{1,6})\s+(.*)$/);
  if (headingMatch) {
    return {
      prefix: "",
      body: headingMatch[2] ?? "",
      isHeading: true,
      isBlank: false,
    };
  }

  const bulletMatch = line.match(/^(\s*)([-*])\s+(.*)$/);
  if (bulletMatch) {
    return {
      prefix: `${bulletMatch[1] ?? ""}${bulletMatch[2] ?? "-"} `,
      body: bulletMatch[3] ?? "",
      isHeading: false,
      isBlank: false,
    };
  }

  const numberedMatch = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
  if (numberedMatch) {
    return {
      prefix: `${numberedMatch[1] ?? ""}${numberedMatch[2] ?? "1"}. `,
      body: numberedMatch[3] ?? "",
      isHeading: false,
      isBlank: false,
    };
  }

  return {
    prefix: "",
    body: line,
    isHeading: false,
    isBlank: false,
  };
}

function renderInlineTokens(tokens: readonly MarkdownInlineToken[], keyPrefix: string): ReactNode[] {
  return tokens.map((token, index) => {
    if (token.type === "bold") {
      return <b key={`${keyPrefix}-bold-${index}`}>{token.value}</b>;
    }

    return token.value;
  });
}

export function MarkdownText({ content, color }: MarkdownTextProps) {
  const { tokens } = useThemeTokens();

  return (
    <Box style={{ flexDirection: "column" }}>
      {content.split("\n").map((line, lineIndex) => {
        const parsed = parseMarkdownLine(line);

        if (parsed.isBlank) {
          return <Text key={`line-${lineIndex}`} style={{ color }}>{""}</Text>;
        }

        if (parsed.isHeading) {
          return (
            <Text key={`line-${lineIndex}`} style={{ color: tokens["text.primary"] }}>
              <b>{parsed.body}</b>
            </Text>
          );
        }

        const inlineTokens = parseInlineMarkdown(parsed.body);
        return (
          <Box key={`line-${lineIndex}`} style={{ flexDirection: "row" }}>
            {parsed.prefix.length > 0 ? <Text style={{ color }}>{parsed.prefix}</Text> : null}
            <Text style={{ color }}>
              {renderInlineTokens(inlineTokens, `line-${lineIndex}`)}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
