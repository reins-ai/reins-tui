import { useState, useCallback, useEffect } from "react";

import type { ProviderConnectionState } from "../providers/connect-service";
import { useThemeTokens } from "../theme";
import { Box, Text, useKeyboard } from "../ui";
import { ModalPanel } from "./modal-panel";

// --- Pure utility (kept for backward compatibility) ---

export function getNextModel(currentModel: string, availableModels: readonly string[]): string {
  if (availableModels.length === 0) return currentModel;
  const currentIndex = availableModels.indexOf(currentModel);
  const safeIndex = currentIndex >= 0 ? currentIndex : 0;
  const nextIndex = (safeIndex + 1) % availableModels.length;
  return availableModels[nextIndex];
}

// --- Provider/model grouping types ---

export interface ProviderModelGroup {
  providerId: string;
  providerName: string;
  connectionState: ProviderConnectionState;
  models: string[];
}

export interface ModelSelectorItem {
  type: "provider-header" | "model" | "connect-hint";
  providerId: string;
  providerName: string;
  modelId?: string;
  disabled: boolean;
}

/**
 * Build a flat list of selectable items from provider groups.
 * Connected providers show their models; disconnected providers
 * show a grayed header with a "Connect with /connect" hint.
 */
export function buildSelectorItems(groups: readonly ProviderModelGroup[]): ModelSelectorItem[] {
  const items: ModelSelectorItem[] = [];

  for (const group of groups) {
    const isConnected = group.connectionState === "ready";

    items.push({
      type: "provider-header",
      providerId: group.providerId,
      providerName: group.providerName,
      disabled: !isConnected,
    });

    if (isConnected) {
      for (const modelId of group.models) {
        items.push({
          type: "model",
          providerId: group.providerId,
          providerName: group.providerName,
          modelId,
          disabled: false,
        });
      }
    } else {
      items.push({
        type: "connect-hint",
        providerId: group.providerId,
        providerName: group.providerName,
        disabled: true,
      });
    }
  }

  return items;
}

/**
 * Get the indices of selectable (non-disabled model) items.
 */
export function getSelectableIndices(items: readonly ModelSelectorItem[]): number[] {
  return items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.type === "model" && !item.disabled)
    .map(({ index }) => index);
}

/**
 * Find the index of the currently selected model in the items list.
 * Returns the first selectable index if the current model is not found.
 */
export function findCurrentModelIndex(
  items: readonly ModelSelectorItem[],
  selectableIndices: readonly number[],
  currentModel: string,
): number {
  const matchIndex = items.findIndex(
    (item) => item.type === "model" && item.modelId === currentModel,
  );

  if (matchIndex >= 0 && selectableIndices.includes(matchIndex)) {
    return selectableIndices.indexOf(matchIndex);
  }

  return 0;
}

// --- Compact model display for headers ---

export function formatModelDisplayName(modelId: string): string {
  // Shorten common model ID patterns for display
  const parts = modelId.split("/");
  return parts.length > 1 ? parts[parts.length - 1] : modelId;
}

// --- Legacy props (kept for backward compatibility) ---

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

// --- Model Selector Modal ---

export interface ModelSelectorModalProps {
  visible: boolean;
  providerGroups: readonly ProviderModelGroup[];
  currentModel: string;
  onSelect: (modelId: string, providerId: string) => void;
  onClose: () => void;
}

export function ModelSelectorModal({
  visible,
  providerGroups,
  currentModel,
  onSelect,
  onClose,
}: ModelSelectorModalProps) {
  const { tokens } = useThemeTokens();
  const items = buildSelectorItems(providerGroups);
  const selectableIndices = getSelectableIndices(items);
  const initialHighlight = findCurrentModelIndex(items, selectableIndices, currentModel);

  const [highlightIndex, setHighlightIndex] = useState(initialHighlight);

  // Reset highlight when visibility changes or groups change
  useEffect(() => {
    if (visible) {
      const nextHighlight = findCurrentModelIndex(items, selectableIndices, currentModel);
      setHighlightIndex(nextHighlight);
    }
  }, [visible, providerGroups.length, currentModel]);

  const moveUp = useCallback(() => {
    if (selectableIndices.length === 0) return;
    setHighlightIndex((prev) => {
      const next = prev - 1;
      return next < 0 ? selectableIndices.length - 1 : next;
    });
  }, [selectableIndices.length]);

  const moveDown = useCallback(() => {
    if (selectableIndices.length === 0) return;
    setHighlightIndex((prev) => {
      const next = prev + 1;
      return next >= selectableIndices.length ? 0 : next;
    });
  }, [selectableIndices.length]);

  const confirmSelection = useCallback(() => {
    if (selectableIndices.length === 0) return;
    const itemIndex = selectableIndices[highlightIndex];
    if (itemIndex === undefined) return;
    const item = items[itemIndex];
    if (item && item.type === "model" && item.modelId) {
      onSelect(item.modelId, item.providerId);
    }
  }, [highlightIndex, selectableIndices, items, onSelect]);

  useKeyboard((event) => {
    if (!visible) return;

    const keyName = event.name ?? "";

    if (keyName === "up" || (keyName === "k" && !event.ctrl)) {
      moveUp();
      return;
    }

    if (keyName === "down" || (keyName === "j" && !event.ctrl)) {
      moveDown();
      return;
    }

    if (keyName === "return" || keyName === "enter") {
      confirmSelection();
      return;
    }
  });

  const highlightedItemIndex = selectableIndices[highlightIndex] ?? -1;
  const hasSelectableModels = selectableIndices.length > 0;

  return (
    <ModalPanel
      visible={visible}
      title="Select Model"
      onClose={onClose}
    >
      <Box style={{ flexDirection: "column" }}>
        {items.length === 0 ? (
          <Box style={{ flexDirection: "column" }}>
            <Text
              content="No providers configured"
              style={{ color: tokens["text.muted"] }}
            />
            <Text
              content="Use /connect to add a provider"
              style={{ color: tokens["text.secondary"] }}
            />
          </Box>
        ) : (
          items.map((item, index) => {
            if (item.type === "provider-header") {
              const statusIcon = item.disabled ? "○" : "●";
              const statusColor = item.disabled
                ? tokens["text.muted"]
                : tokens["status.success"];

              return (
                <Box
                  key={`provider-${item.providerId}`}
                  style={{
                    flexDirection: "row",
                    marginTop: index > 0 ? 1 : 0,
                    marginBottom: 0,
                  }}
                >
                  <Text
                    content={statusIcon}
                    style={{ color: statusColor }}
                  />
                  <Text content=" " />
                  <Text
                    content={item.providerName}
                    style={{
                      color: item.disabled
                        ? tokens["text.muted"]
                        : tokens["accent.primary"],
                    }}
                  />
                </Box>
              );
            }

            if (item.type === "connect-hint") {
              return (
                <Box
                  key={`hint-${item.providerId}`}
                  style={{ flexDirection: "row", paddingLeft: 3 }}
                >
                  <Text
                    content="Connect with /connect"
                    style={{ color: tokens["text.muted"] }}
                  />
                </Box>
              );
            }

            // Model item
            const isHighlighted = index === highlightedItemIndex;
            const isCurrentModel = item.modelId === currentModel;
            const displayName = formatModelDisplayName(item.modelId ?? "");
            const prefix = isCurrentModel ? "✦ " : "  ";

            return (
              <Box
                key={`model-${item.providerId}-${item.modelId}`}
                style={{
                  flexDirection: "row",
                  paddingLeft: 2,
                  backgroundColor: isHighlighted
                    ? tokens["surface.elevated"]
                    : undefined,
                }}
              >
                <Text
                  content={prefix}
                  style={{
                    color: isCurrentModel
                      ? tokens["accent.primary"]
                      : tokens["text.muted"],
                  }}
                />
                <Text
                  content={isHighlighted ? `▸ ${displayName}` : displayName}
                  style={{
                    color: isHighlighted
                      ? tokens["accent.primary"]
                      : isCurrentModel
                        ? tokens["text.primary"]
                        : tokens["text.secondary"],
                  }}
                />
              </Box>
            );
          })
        )}

        {/* Footer hints */}
        <Box style={{ flexDirection: "row", marginTop: 1 }}>
          <Text
            content={hasSelectableModels ? "↑↓ navigate  Enter select  Esc close" : "Esc close"}
            style={{ color: tokens["text.muted"] }}
          />
        </Box>
      </Box>
    </ModalPanel>
  );
}
