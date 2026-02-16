import { useThemeTokens } from "../theme";
import { Box, Text } from "../ui";

export interface ThinkingBlockProps {
  content: string;
  isStreaming?: boolean;
}

export function ThinkingBlock({ content, isStreaming = false }: ThinkingBlockProps) {
  const { tokens } = useThemeTokens();
  const mutedColor = tokens["text.muted"];

  return (
    <Box style={{ flexDirection: "column", marginTop: 0 }}>
      <Text style={{ color: mutedColor }}>
        <b>{"Thinking:"}</b>
      </Text>
      <Box style={{ marginLeft: 2 }}>
        <Text style={{ color: mutedColor }}>
          {isStreaming ? `${content}\u258A` : content}
        </Text>
      </Box>
    </Box>
  );
}
