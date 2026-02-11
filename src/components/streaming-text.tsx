import { Box, Text } from "../ui";

export interface StreamingTextProps {
  content: string;
  isStreaming?: boolean;
}

export function buildStreamingText(content: string, isStreaming: boolean): string {
  return isStreaming ? `${content}▊` : content;
}

export function StreamingText({ content, isStreaming = false }: StreamingTextProps) {
  return (
    <Box>
      <Text>{buildStreamingText(content, isStreaming)}</Text>
    </Box>
  );
}
