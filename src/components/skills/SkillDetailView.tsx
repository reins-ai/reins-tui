import { useThemeTokens } from "../../theme";
import { Box, Text } from "../../ui";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type SkillTrustLevel = "trusted" | "untrusted" | "verified";

export type SkillIntegrationStatus = "not_required" | "needs_setup" | "setup_complete";

export interface SkillDetailData {
  readonly name: string;
  readonly description: string;
  readonly version?: string;
  readonly enabled: boolean;
  readonly trustLevel: SkillTrustLevel;
  readonly categories: string[];
  readonly triggers: string[];
  readonly requiredTools: string[];
  readonly scripts: string[];
  readonly integrationStatus: SkillIntegrationStatus;
  readonly body: string;
}

export interface SkillDetailViewProps {
  skill: SkillDetailData | null;
  onBack: () => void;
  onToggleEnabled: (name: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers (exported for testing)
// ---------------------------------------------------------------------------

export interface MetadataRow {
  readonly label: string;
  readonly value: string;
}

/**
 * Builds an array of label/value rows for the metadata section.
 * Only includes rows where the value is non-empty.
 */
export function formatMetadataRows(skill: SkillDetailData): MetadataRow[] {
  const rows: MetadataRow[] = [];

  if (skill.version) {
    rows.push({ label: "Version", value: skill.version });
  }

  const cats = formatCategories(skill.categories);
  if (cats.length > 0) {
    rows.push({ label: "Categories", value: cats });
  }

  rows.push({ label: "Trust", value: getTrustLabel(skill.trustLevel) });

  const trigs = formatTriggers(skill.triggers);
  if (trigs.length > 0) {
    rows.push({ label: "Triggers", value: trigs });
  }

  if (skill.requiredTools.length > 0) {
    rows.push({ label: "Required Tools", value: skill.requiredTools.join(", ") });
  }

  return rows;
}

/**
 * Returns a human-readable label for the integration status,
 * or null when integration is not required.
 */
export function getIntegrationStatusText(status: SkillIntegrationStatus): string | null {
  switch (status) {
    case "not_required":
      return null;
    case "needs_setup":
      return "Needs setup";
    case "setup_complete":
      return "Setup complete";
  }
}

/**
 * Joins categories into a comma-separated string.
 */
export function formatCategories(categories: string[]): string {
  return categories.join(", ");
}

/**
 * Joins triggers into a comma-separated string.
 */
export function formatTriggers(triggers: string[]): string {
  return triggers.join(", ");
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getTrustLabel(level: SkillTrustLevel): string {
  switch (level) {
    case "trusted":
      return "Trusted";
    case "untrusted":
      return "Untrusted";
    case "verified":
      return "Verified";
  }
}

function getTrustGlyph(level: SkillTrustLevel): string {
  switch (level) {
    case "trusted":
      return "✓";
    case "untrusted":
      return "⚠";
    case "verified":
      return "◆";
  }
}

function getTrustColorToken(level: SkillTrustLevel): string {
  switch (level) {
    case "trusted":
      return "status.success";
    case "untrusted":
      return "status.warning";
    case "verified":
      return "accent.primary";
  }
}

function getIntegrationColorToken(status: SkillIntegrationStatus): string {
  switch (status) {
    case "not_required":
      return "text.muted";
    case "needs_setup":
      return "status.warning";
    case "setup_complete":
      return "status.success";
  }
}

function getIntegrationGlyph(status: SkillIntegrationStatus): string {
  switch (status) {
    case "not_required":
      return "";
    case "needs_setup":
      return "○";
    case "setup_complete":
      return "●";
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function EmptyState({ tokens }: { tokens: Record<string, string> }) {
  return (
    <Box style={{ flexDirection: "column", flexGrow: 1 }}>
      <Box style={{ flexDirection: "row", marginBottom: 1 }}>
        <Text content="Skill Detail" style={{ color: tokens["text.secondary"] }} />
      </Box>
      <Box style={{ paddingLeft: 2 }}>
        <Text content="Select a skill" style={{ color: tokens["text.muted"] }} />
      </Box>
    </Box>
  );
}

function Header({
  skill,
  tokens,
}: {
  skill: SkillDetailData;
  tokens: Record<string, string>;
}) {
  const trustGlyph = getTrustGlyph(skill.trustLevel);
  const trustColor = tokens[getTrustColorToken(skill.trustLevel)];
  const enabledText = skill.enabled ? "enabled" : "disabled";
  const enabledColor = skill.enabled ? tokens["status.success"] : tokens["text.muted"];

  return (
    <Box style={{ flexDirection: "column", marginBottom: 1 }}>
      <Box style={{ flexDirection: "row" }}>
        <Text content={skill.name} style={{ color: tokens["text.primary"], fontWeight: "bold" }} />
        {skill.version ? (
          <Text content={`  v${skill.version}`} style={{ color: tokens["text.muted"] }} />
        ) : null}
      </Box>
      <Box style={{ flexDirection: "row" }}>
        <Text content={`[${enabledText}]`} style={{ color: enabledColor }} />
        <Text content="  " style={{ color: tokens["text.muted"] }} />
        <Text content={trustGlyph} style={{ color: trustColor }} />
        <Text content={` ${getTrustLabel(skill.trustLevel)}`} style={{ color: trustColor }} />
      </Box>
      {skill.description.length > 0 ? (
        <Box style={{ flexDirection: "row", marginTop: 1 }}>
          <Text content={skill.description} style={{ color: tokens["text.secondary"] }} />
        </Box>
      ) : null}
    </Box>
  );
}

function MetadataSection({
  rows,
  tokens,
}: {
  rows: MetadataRow[];
  tokens: Record<string, string>;
}) {
  if (rows.length === 0) return null;

  return (
    <Box style={{ flexDirection: "column", marginBottom: 1 }}>
      <Text content="Metadata" style={{ color: tokens["text.muted"] }} />
      {rows.map((row) => (
        <Box key={row.label} style={{ flexDirection: "row", paddingLeft: 2 }}>
          <Text content={`${row.label}: `} style={{ color: tokens["text.muted"] }} />
          <Text content={row.value} style={{ color: tokens["text.secondary"] }} />
        </Box>
      ))}
    </Box>
  );
}

function ScriptsSection({
  scripts,
  tokens,
}: {
  scripts: string[];
  tokens: Record<string, string>;
}) {
  return (
    <Box style={{ flexDirection: "column", marginBottom: 1 }}>
      <Text
        content={`Scripts (${scripts.length})`}
        style={{ color: tokens["text.muted"] }}
      />
      {scripts.length === 0 ? (
        <Box style={{ paddingLeft: 2 }}>
          <Text content="No scripts" style={{ color: tokens["text.muted"] }} />
        </Box>
      ) : (
        scripts.map((script) => (
          <Box key={script} style={{ flexDirection: "row", paddingLeft: 2 }}>
            <Text content="• " style={{ color: tokens["accent.primary"] }} />
            <Text content={script} style={{ color: tokens["text.primary"] }} />
          </Box>
        ))
      )}
    </Box>
  );
}

function IntegrationSection({
  status,
  tokens,
}: {
  status: SkillIntegrationStatus;
  tokens: Record<string, string>;
}) {
  const text = getIntegrationStatusText(status);
  if (text === null) return null;

  const color = tokens[getIntegrationColorToken(status)];
  const glyph = getIntegrationGlyph(status);

  return (
    <Box style={{ flexDirection: "column", marginBottom: 1 }}>
      <Text content="Integration" style={{ color: tokens["text.muted"] }} />
      <Box style={{ flexDirection: "row", paddingLeft: 2 }}>
        <Text content={`${glyph} `} style={{ color }} />
        <Text content={text} style={{ color }} />
      </Box>
    </Box>
  );
}

function BodySection({
  body,
  tokens,
}: {
  body: string;
  tokens: Record<string, string>;
}) {
  if (body.length === 0) return null;

  return (
    <Box style={{ flexDirection: "column", marginBottom: 1 }}>
      <Text content="Content" style={{ color: tokens["text.muted"] }} />
      <Box style={{ paddingLeft: 2, marginTop: 1 }}>
        <Text content={body} style={{ color: tokens["text.secondary"] }} />
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SkillDetailView({ skill, onBack, onToggleEnabled }: SkillDetailViewProps) {
  const { tokens } = useThemeTokens();

  // Suppress unused variable warnings — callbacks are wired by the parent (Task 5.3)
  void onBack;
  void onToggleEnabled;

  if (!skill) {
    return <EmptyState tokens={tokens} />;
  }

  const metadataRows = formatMetadataRows(skill);

  return (
    <Box style={{ flexDirection: "column", flexGrow: 1 }}>
      <Header skill={skill} tokens={tokens} />
      <MetadataSection rows={metadataRows} tokens={tokens} />
      <ScriptsSection scripts={skill.scripts} tokens={tokens} />
      <IntegrationSection status={skill.integrationStatus} tokens={tokens} />
      <BodySection body={skill.body} tokens={tokens} />
    </Box>
  );
}
