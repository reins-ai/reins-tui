import { useApp } from "../store";
import { useThemeTokens } from "../theme";
import { Box, Text, type TerminalDimensions } from "../ui";

export interface StatusBarProps {
  version: string;
  dimensions: TerminalDimensions;
  showHelp: boolean;
}

export function StatusBar({ version, dimensions, showHelp }: StatusBarProps) {
  const { state } = useApp();
  const { tokens } = useThemeTokens();
  const streaming = state.isStreaming ? "Streaming" : "Idle";
  const connection = state.status === "Exiting" ? "Disconnecting" : "Connected";
  const help = showHelp ? "Help on" : "Help off";

  return (
    <Box style={{ height: 1, backgroundColor: tokens["surface.primary"], color: tokens["text.primary"], marginTop: 1, paddingLeft: 1 }}>
      <Text>
        {`v${version} | model ${state.currentModel} | ${connection} | ${state.status} | ${streaming} | ${dimensions.width}x${dimensions.height} | Tab/Shift+Tab focus | Ctrl+1/2/3 jump | q quit | ? help (${help})`}
      </Text>
    </Box>
  );
}
