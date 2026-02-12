import { useThemeTokens } from "../theme";
import { Box, Text } from "../ui";

export function getNextModel(currentModel: string, availableModels: readonly string[]): string {
  if (availableModels.length === 0) return currentModel;
  const currentIndex = availableModels.indexOf(currentModel);
  const safeIndex = currentIndex >= 0 ? currentIndex : 0;
  const nextIndex = (safeIndex + 1) % availableModels.length;
  return availableModels[nextIndex];
}

export interface ModelSelectorProps {
  currentModel: string;
  availableModels: readonly string[];
  onCycleModel(): void;
}

export function ModelSelector({ currentModel, availableModels, onCycleModel: _onCycleModel }: ModelSelectorProps) {
  const { tokens } = useThemeTokens();
  const hasModels = availableModels.length > 0;

  return (
    <Box
      style={{
        border: true,
        borderColor: tokens["border.subtle"],
        paddingLeft: 1,
        paddingRight: 1,
        flexDirection: "column",
      }}
    >
      <Text content="Model" style={{ color: tokens["text.secondary"] }} />
      <Text
        content={hasModels ? currentModel : "No models available"}
        style={{ color: hasModels ? tokens["text.primary"] : tokens["text.muted"] }}
      />
      <Text
        content={hasModels ? "Press M to cycle" : "/connect to add provider"}
        style={{ color: tokens["text.muted"] }}
      />
    </Box>
  );
}
