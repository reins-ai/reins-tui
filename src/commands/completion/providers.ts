/**
 * Dynamic value providers for command completion.
 *
 * Providers supply runtime values (model names, theme names, etc.)
 * to the completion engine so suggestions stay in sync with app state.
 */

// ---------------------------------------------------------------------------
// Provider context
// ---------------------------------------------------------------------------

/**
 * Data the completion system needs from the app to resolve dynamic values.
 * Built from React state/context in the integration hook.
 */
export interface CompletionProviderContext {
  /** Available AI model identifiers */
  readonly models: readonly string[];
  /** Function to list available theme names */
  readonly themes: () => readonly string[];
  /** Available environment names */
  readonly environments: readonly string[];
  /** All command names (for /help completion) */
  readonly commands: readonly string[];
}

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

export interface DynamicProvider {
  /** Unique provider ID referenced in ArgSpec/FlagSpec */
  readonly id: string;
  /** Resolve current values from the app context */
  getValues(ctx: CompletionProviderContext): readonly string[];
}

// ---------------------------------------------------------------------------
// Built-in providers
// ---------------------------------------------------------------------------

const modelsProvider: DynamicProvider = {
  id: "models",
  getValues(ctx) {
    return ctx.models;
  },
};

const themesProvider: DynamicProvider = {
  id: "themes",
  getValues(ctx) {
    return ctx.themes();
  },
};

const environmentsProvider: DynamicProvider = {
  id: "environments",
  getValues(ctx) {
    return ctx.environments;
  },
};

const commandsProvider: DynamicProvider = {
  id: "commands",
  getValues(ctx) {
    return ctx.commands;
  },
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const PROVIDER_MAP = new Map<string, DynamicProvider>();

function registerProvider(provider: DynamicProvider): void {
  PROVIDER_MAP.set(provider.id, provider);
}

registerProvider(modelsProvider);
registerProvider(themesProvider);
registerProvider(environmentsProvider);
registerProvider(commandsProvider);

/**
 * Resolve dynamic values for a given provider ID.
 * Returns an empty array if the provider is not found.
 */
export function resolveProviderValues(
  providerId: string,
  ctx: CompletionProviderContext,
): readonly string[] {
  const provider = PROVIDER_MAP.get(providerId);
  if (!provider) {
    return [];
  }
  return provider.getValues(ctx);
}
