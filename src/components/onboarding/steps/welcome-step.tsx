import { useEffect, useState } from "react";

import type { OnboardingMode } from "@reins/core";
import { Box, Text, useKeyboard } from "../../../ui";
import type { StepViewProps } from "./index";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MODES: { id: OnboardingMode; label: string; description: string }[] = [
  {
    id: "quickstart",
    label: "Quick",
    description: "Sensible defaults, minimal prompts — fastest path to a working setup.",
  },
  {
    id: "advanced",
    label: "Advanced",
    description: "Granular control over every step — configure each option yourself.",
  },
];

/** The sections a user can Tab between on this step. */
type Section = "name" | "mode";
const SECTIONS: Section[] = ["name", "mode"];

// ---------------------------------------------------------------------------
// Component
//
// Two focusable sections: name input and mode selection.
// - Tab cycles focus between sections.
// - Enter advances to the next section; at the last section it requests
//   the wizard to advance to the next page.
// - Up/Down only affect mode selection when that section is focused.
// - Character input only works when the name section is focused.
// ---------------------------------------------------------------------------

export function WelcomeStepView({ tokens, engineState: _engineState, onStepData, onRequestNext }: StepViewProps) {
  const [nameInput, setNameInput] = useState("");
  const [selectedModeIndex, setSelectedModeIndex] = useState(0);
  const [activeSection, setActiveSection] = useState<Section>("name");

  // Emit step data on changes
  useEffect(() => {
    const resolvedName = nameInput.trim().length > 0 ? nameInput : "User";
    onStepData({
      userName: resolvedName,
      selectedMode: MODES[selectedModeIndex].id,
    });
  }, [nameInput, selectedModeIndex, onStepData]);

  useKeyboard((event) => {
    const keyName = event.name ?? "";
    const sequence = event.sequence ?? "";

    // --- Tab: cycle between sections ---
    if (keyName === "tab") {
      setActiveSection((prev) => {
        const idx = SECTIONS.indexOf(prev);
        return SECTIONS[(idx + 1) % SECTIONS.length];
      });
      return;
    }

    // --- Enter: advance within step, then to next page ---
    if (keyName === "return" || keyName === "enter") {
      if (activeSection === "name") {
        // Move focus to mode section
        setActiveSection("mode");
      } else {
        // Last section — advance wizard to next page
        onRequestNext();
      }
      return;
    }

    // --- Section-specific keys ---

    if (activeSection === "mode") {
      if (keyName === "up") {
        setSelectedModeIndex((prev) =>
          prev <= 0 ? MODES.length - 1 : prev - 1,
        );
        return;
      }
      if (keyName === "down") {
        setSelectedModeIndex((prev) =>
          (prev + 1) % MODES.length,
        );
        return;
      }
      // No character input when mode section is focused
      return;
    }

    // activeSection === "name"
    if (keyName === "backspace" || keyName === "delete") {
      setNameInput((prev) => prev.slice(0, Math.max(0, prev.length - 1)));
      return;
    }

    if (event.ctrl === true || event.meta === true) {
      return;
    }

    if (sequence.length === 1 && keyName !== "escape") {
      setNameInput((prev) => `${prev}${sequence}`);
    }
  });

  const isNameActive = activeSection === "name";
  const isModeActive = activeSection === "mode";

  const displayName = nameInput.length > 0 ? nameInput : "User";
  const displayNameColor = nameInput.length > 0 ? tokens["text.primary"] : tokens["text.muted"];

  // Build mode option lines — each mode is a label line + description line
  const modeLines: React.ReactNode[] = [];
  for (let i = 0; i < MODES.length; i++) {
    const mode = MODES[i];
    const isSelected = i === selectedModeIndex;
    const prefix = isSelected ? "> " : "  ";
    const labelColor = isSelected
      ? (isModeActive ? tokens["text.primary"] : tokens["text.secondary"])
      : tokens["text.secondary"];

    modeLines.push(
      <Box key={`${mode.id}-label`}>
        <Text
          content={`${prefix}${mode.label}`}
          style={{ color: labelColor }}
        />
      </Box>,
    );
    modeLines.push(
      <Box key={`${mode.id}-desc`}>
        <Text
          content={`  ${mode.description}`}
          style={{ color: tokens["text.muted"] }}
        />
      </Box>,
    );
    if (i < MODES.length - 1) {
      modeLines.push(
        <Box key={`${mode.id}-spacer`}>
          <Text content=" " />
        </Box>,
      );
    }
  }

  return (
    <Box style={{ flexDirection: "column" }}>
      {/* Title */}
      <Box>
        <Text
          content="Welcome to Reins!"
          style={{ color: tokens["accent.primary"] }}
        />
      </Box>

      {/* Blank line */}
      <Box>
        <Text content=" " />
      </Box>

      {/* Subtitle */}
      <Box>
        <Text
          content="Let's get you set up. First, what should we call you?"
          style={{ color: tokens["text.secondary"] }}
        />
      </Box>

      {/* Blank line */}
      <Box>
        <Text content=" " />
      </Box>

      {/* --- Name section --- */}
      <Box>
        <Text
          content="Your name:"
          style={{ color: isNameActive ? tokens["accent.primary"] : tokens["text.muted"] }}
        />
      </Box>
      <Box>
        <Text
          content={isNameActive ? `> ${displayName}\u2588` : `  ${displayName}`}
          style={{ color: isNameActive ? displayNameColor : tokens["text.muted"] }}
        />
      </Box>

      {/* Blank line */}
      <Box>
        <Text content=" " />
      </Box>

      {/* --- Mode section --- */}
      <Box>
        <Text
          content="Setup mode:"
          style={{ color: isModeActive ? tokens["accent.primary"] : tokens["text.muted"] }}
        />
      </Box>

      {/* Blank line */}
      <Box>
        <Text content=" " />
      </Box>

      {/* Mode options */}
      {modeLines}

      {/* Blank line */}
      <Box>
        <Text content=" " />
      </Box>

      {/* Context-sensitive hint */}
      <Box>
        <Text
          content={
            isNameActive
              ? "Type your name  ·  Enter/Tab next section  ·  Esc back"
              : "Up/Down select  ·  Enter continue  ·  Tab name section  ·  Esc back"
          }
          style={{ color: tokens["text.muted"] }}
        />
      </Box>
    </Box>
  );
}
