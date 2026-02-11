import { useThemeTokens } from "../theme";
import { Box, Text } from "../ui";

export const AVAILABLE_MODELS = ["default", "claude-3.5-sonnet", "gpt-4o", "gemini-pro"] as const;

export type AvailableModel = (typeof AVAILABLE_MODELS)[number];

export function getNextModel(currentModel: string): AvailableModel {
  const currentIndex = AVAILABLE_MODELS.indexOf(currentModel as AvailableModel);
  const safeIndex = currentIndex >= 0 ? currentIndex : 0;
  const nextIndex = (safeIndex + 1) % AVAILABLE_MODELS.length;
  return AVAILABLE_MODELS[nextIndex];
}

export interface ModelSelectorProps {
  currentModel: string;
  onCycleModel(): void;
}

export function ModelSelector({ currentModel, onCycleModel: _onCycleModel }: ModelSelectorProps) {
  const { tokens } = useThemeTokens();

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
      <Text content={currentModel} style={{ color: tokens["text.primary"] }} />
      <Text content="Press M to cycle" style={{ color: tokens["text.muted"] }} />
    </Box>
  );
}
