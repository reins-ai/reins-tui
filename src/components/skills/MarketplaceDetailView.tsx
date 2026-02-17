import { useCallback, useEffect, useReducer } from "react";

import type {
  MarketplaceSkillDetail,
  MarketplaceSource,
} from "@reins/core";

import { useThemeTokens } from "../../theme";
import { Box, Text, useKeyboard } from "../../ui";
import { TrustBadge } from "./TrustBadge";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface MarketplaceDetailViewProps {
  readonly slug: string;
  readonly source: MarketplaceSource;
  readonly onBack: () => void;
  readonly onInstall: (slug: string, version: string) => void;
}

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

export type DetailViewStatus = "loading" | "loaded" | "error";

export interface DetailViewState {
  readonly status: DetailViewStatus;
  readonly detail: MarketplaceSkillDetail | null;
  readonly error: string | null;
}

export type DetailViewAction =
  | { type: "SET_LOADING" }
  | { type: "SET_LOADED"; detail: MarketplaceSkillDetail }
  | { type: "SET_ERROR"; error: string };

export const INITIAL_DETAIL_STATE: DetailViewState = {
  status: "loading",
  detail: null,
  error: null,
};

export function detailViewReducer(
  state: DetailViewState,
  action: DetailViewAction,
): DetailViewState {
  switch (action.type) {
    case "SET_LOADING":
      return { status: "loading", detail: null, error: null };

    case "SET_LOADED":
      return { status: "loaded", detail: action.detail, error: null };

    case "SET_ERROR":
      return { status: "error", detail: null, error: action.error };

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Helpers (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Formats an install count for display (e.g. 1234 → "1.2k").
 * Reuses the same logic as MarketplaceListPanel for consistency.
 */
export function formatInstallCount(count: number): string {
  if (count < 1000) return String(count);
  if (count < 10000) {
    const k = count / 1000;
    return `${k.toFixed(1)}k`;
  }
  if (count < 1000000) {
    const k = Math.round(count / 1000);
    return `${k}k`;
  }
  const m = count / 1000000;
  return `${m.toFixed(1)}M`;
}

/**
 * Formats an ISO date string to a short human-readable form (e.g. "Feb 10, 2026").
 */
export function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  if (isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Builds metadata rows for the detail view.
 */
export interface MetadataRow {
  readonly label: string;
  readonly value: string;
}

export function formatDetailMetadataRows(detail: MarketplaceSkillDetail): MetadataRow[] {
  const rows: MetadataRow[] = [];

  rows.push({ label: "Author", value: detail.author });
  rows.push({ label: "Version", value: detail.version });
  rows.push({ label: "Installs", value: formatInstallCount(detail.installCount) });

  if (detail.license) {
    rows.push({ label: "License", value: detail.license });
  }

  rows.push({ label: "Updated", value: formatDate(detail.updatedAt) });

  return rows;
}

/**
 * Returns the help actions for the marketplace detail view.
 */
export function getDetailHelpActions(
  status: DetailViewStatus,
): readonly { key: string; label: string }[] {
  if (status === "error") {
    return [
      { key: "r", label: "Retry" },
      { key: "Esc", label: "Back" },
    ];
  }

  if (status === "loading") {
    return [{ key: "Esc", label: "Back" }];
  }

  return [
    { key: "Enter", label: "Install" },
    { key: "Esc", label: "Back" },
  ];
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function DetailHeader({
  detail,
  tokens,
}: {
  detail: MarketplaceSkillDetail;
  tokens: Record<string, string>;
}) {
  return (
    <Box style={{ flexDirection: "column", marginBottom: 1 }}>
      <Box style={{ flexDirection: "row" }}>
        <Text
          content={detail.name}
          style={{ color: tokens["text.primary"], fontWeight: "bold" }}
        />
        <Text content="  " style={{ color: tokens["text.muted"] }} />
        <TrustBadge level={detail.trustLevel} />
      </Box>
      {detail.description.length > 0 ? (
        <Box style={{ flexDirection: "row", marginTop: 1 }}>
          <Text content={detail.description} style={{ color: tokens["text.secondary"] }} />
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

function CategoriesSection({
  categories,
  tokens,
}: {
  categories: string[];
  tokens: Record<string, string>;
}) {
  if (categories.length === 0) return null;

  return (
    <Box style={{ flexDirection: "column", marginBottom: 1 }}>
      <Text content="Categories" style={{ color: tokens["text.muted"] }} />
      <Box style={{ flexDirection: "row", paddingLeft: 2 }}>
        <Text content={categories.join(", ")} style={{ color: tokens["text.secondary"] }} />
      </Box>
    </Box>
  );
}

function RequiredToolsSection({
  tools,
  tokens,
}: {
  tools: string[];
  tokens: Record<string, string>;
}) {
  if (tools.length === 0) return null;

  return (
    <Box style={{ flexDirection: "column", marginBottom: 1 }}>
      <Text content="Required Tools" style={{ color: tokens["text.muted"] }} />
      {tools.map((tool) => (
        <Box key={tool} style={{ flexDirection: "row", paddingLeft: 2 }}>
          <Text content="• " style={{ color: tokens["accent.primary"] }} />
          <Text content={tool} style={{ color: tokens["text.primary"] }} />
        </Box>
      ))}
    </Box>
  );
}

function DescriptionSection({
  text,
  tokens,
}: {
  text: string;
  tokens: Record<string, string>;
}) {
  if (text.length === 0) return null;

  return (
    <Box style={{ flexDirection: "column", marginBottom: 1 }}>
      <Text content="Description" style={{ color: tokens["text.muted"] }} />
      <Box style={{ paddingLeft: 2, marginTop: 1 }}>
        <Text content={text} style={{ color: tokens["text.secondary"] }} />
      </Box>
    </Box>
  );
}

function VersionHistorySection({
  versions,
  tokens,
}: {
  versions: string[];
  tokens: Record<string, string>;
}) {
  if (versions.length === 0) return null;

  // Show up to 5 most recent versions
  const displayVersions = versions.slice(0, 5);

  return (
    <Box style={{ flexDirection: "column", marginBottom: 1 }}>
      <Text
        content={`Versions (${versions.length})`}
        style={{ color: tokens["text.muted"] }}
      />
      {displayVersions.map((version) => (
        <Box key={version} style={{ flexDirection: "row", paddingLeft: 2 }}>
          <Text content="• " style={{ color: tokens["accent.primary"] }} />
          <Text content={version} style={{ color: tokens["text.secondary"] }} />
        </Box>
      ))}
      {versions.length > 5 ? (
        <Box style={{ paddingLeft: 2 }}>
          <Text
            content={`  +${versions.length - 5} more`}
            style={{ color: tokens["text.muted"] }}
          />
        </Box>
      ) : null}
    </Box>
  );
}

function HomepageSection({
  url,
  tokens,
}: {
  url: string;
  tokens: Record<string, string>;
}) {
  return (
    <Box style={{ flexDirection: "column", marginBottom: 1 }}>
      <Text content="Homepage" style={{ color: tokens["text.muted"] }} />
      <Box style={{ flexDirection: "row", paddingLeft: 2 }}>
        <Text content={url} style={{ color: tokens["accent.primary"] }} />
      </Box>
    </Box>
  );
}

function HelpBar({
  status,
  tokens,
}: {
  status: DetailViewStatus;
  tokens: Record<string, string>;
}) {
  const actions = getDetailHelpActions(status);

  return (
    <Box style={{ flexDirection: "row" }}>
      {actions.map((action, index) => (
        <Box key={action.key} style={{ flexDirection: "row" }}>
          {index > 0 ? (
            <Text content="  " style={{ color: tokens["text.muted"] }} />
          ) : null}
          <Text
            content={`[${action.key}]`}
            style={{ color: tokens["accent.primary"] }}
          />
          <Text
            content={` ${action.label}`}
            style={{ color: tokens["text.secondary"] }}
          />
        </Box>
      ))}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function MarketplaceDetailView({
  slug,
  source,
  onBack,
  onInstall,
}: MarketplaceDetailViewProps) {
  const { tokens } = useThemeTokens();
  const [state, dispatch] = useReducer(detailViewReducer, INITIAL_DETAIL_STATE);

  // --- Fetch detail on mount or slug change ---
  const fetchDetail = useCallback(() => {
    dispatch({ type: "SET_LOADING" });

    source.getDetail(slug).then((result) => {
      if (result.ok) {
        dispatch({ type: "SET_LOADED", detail: result.value });
      } else {
        dispatch({ type: "SET_ERROR", error: result.error.message });
      }
    }).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : "Unknown error";
      dispatch({ type: "SET_ERROR", error: message });
    });
  }, [source, slug]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  // --- Keyboard handling ---
  useKeyboard(useCallback((event) => {
    const keyName = event.name ?? "";
    const sequence = event.sequence ?? "";

    if (keyName === "escape" || keyName === "esc") {
      onBack();
      return;
    }

    if (state.status === "error" && (keyName === "r" || sequence === "r")) {
      fetchDetail();
      return;
    }

    if (state.status === "loaded" && state.detail && (keyName === "return" || keyName === "enter")) {
      onInstall(state.detail.slug, state.detail.version);
      return;
    }
  }, [state.status, state.detail, onBack, onInstall, fetchDetail]));

  // --- Loading state ---
  if (state.status === "loading") {
    return (
      <Box style={{ flexDirection: "column", flexGrow: 1 }}>
        <Box style={{ paddingLeft: 2, paddingTop: 1 }}>
          <Text
            content="Loading skill details..."
            style={{ color: tokens["text.muted"] }}
          />
        </Box>
        <Box style={{ marginTop: 1 }}>
          <HelpBar status="loading" tokens={tokens} />
        </Box>
      </Box>
    );
  }

  // --- Error state ---
  if (state.status === "error") {
    return (
      <Box style={{ flexDirection: "column", flexGrow: 1 }}>
        <Box style={{ paddingLeft: 2, paddingTop: 1 }}>
          <Text
            content={`Failed to load details: ${state.error}. Press r to retry.`}
            style={{ color: tokens["status.error"] }}
          />
        </Box>
        <Box style={{ marginTop: 1 }}>
          <HelpBar status="error" tokens={tokens} />
        </Box>
      </Box>
    );
  }

  // --- Loaded state ---
  const detail = state.detail!;
  const metadataRows = formatDetailMetadataRows(detail);

  return (
    <Box style={{ flexDirection: "column", flexGrow: 1 }}>
      <DetailHeader detail={detail} tokens={tokens} />
      <MetadataSection rows={metadataRows} tokens={tokens} />
      <CategoriesSection categories={detail.categories} tokens={tokens} />
      <RequiredToolsSection tools={detail.requiredTools} tokens={tokens} />
      <DescriptionSection text={detail.fullDescription} tokens={tokens} />
      <VersionHistorySection versions={detail.versions} tokens={tokens} />
      {detail.homepage ? (
        <HomepageSection url={detail.homepage} tokens={tokens} />
      ) : null}
      <Box style={{ marginTop: 1 }}>
        <HelpBar status="loaded" tokens={tokens} />
      </Box>
    </Box>
  );
}
