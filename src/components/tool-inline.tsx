import { useThemeTokens } from "../theme";
import type { ThemeTokens } from "../theme/theme-schema";
import type { ToolCall, ToolCallStatus } from "../tools/tool-lifecycle";
import { toolCallToMessageContent } from "../tools/tool-lifecycle";
import { Box, Text } from "../ui";

export interface ToolInlineProps {
  call: ToolCall;
  collapsed: boolean;
}

export function getStatusColor(status: ToolCallStatus, tokens: Readonly<ThemeTokens>): string {
  switch (status) {
    case "queued":
    case "running":
      return tokens["glyph.tool.running"];
    case "success":
      return tokens["glyph.tool.done"];
    case "error":
      return tokens["glyph.tool.error"];
  }
}

export function formatDetailSection(call: ToolCall, maxLength: number = 200): string | undefined {
  const sections: string[] = [];

  if (call.args !== undefined) {
    sections.push(`Args: ${compactStringify(call.args)}`);
  }

  if (call.result !== undefined) {
    sections.push(`Result: ${compactStringify(call.result)}`);
  }

  if (call.error !== undefined && call.error.length > 0) {
    sections.push(`Error: ${call.error}`);
  }

  if (sections.length === 0) {
    return undefined;
  }

  const joined = sections.join("\n");
  if (joined.length <= maxLength) {
    return joined;
  }

  return `${joined.slice(0, maxLength)}...`;
}

function compactStringify(value: unknown): string {
  try {
    const json = JSON.stringify(value);
    if (json === undefined) {
      return String(value);
    }
    return json;
  } catch {
    return String(value);
  }
}

export function ToolInline({ call, collapsed }: ToolInlineProps) {
  const { tokens } = useThemeTokens();
  const content = toolCallToMessageContent(call);
  const statusColor = getStatusColor(call.status, tokens);
  const detail = formatDetailSection(call);
  const isExpanded = !collapsed && detail !== undefined;

  return (
    <Box style={{ flexDirection: "column", marginLeft: 2 }}>
      <Box style={{ flexDirection: "row" }}>
        <Text style={{ color: statusColor }}>{content.glyph}</Text>
        <Text style={{ color: tokens["text.secondary"] }}>{` ${content.label}`}</Text>
        {detail !== undefined ? (
          <Text style={{ color: tokens["text.muted"] }}>{collapsed ? " [+]" : " [-]"}</Text>
        ) : null}
      </Box>

      {isExpanded ? (
        <Box
          style={{
            flexDirection: "column",
            marginLeft: 3,
            marginTop: 0,
            paddingLeft: 1,
          }}
        >
          {detail.split("\n").map((line, i) => (
            <Text key={i} style={{ color: tokens["text.muted"] }}>
              {line}
            </Text>
          ))}
        </Box>
      ) : null}
    </Box>
  );
}
