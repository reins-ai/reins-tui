import { describe, expect, it } from "bun:test";

import { checkAnyProviderConfigured } from "../../../src/components/onboarding/wizard-shell";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_BASE_URL = "http://localhost:7433";

function createMockFetch(handler: (url: string) => Response): typeof fetch {
  return ((input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    return Promise.resolve(handler(url));
  }) as typeof fetch;
}

function testDeps(handler: (url: string) => Response) {
  return {
    fetchFn: createMockFetch(handler),
    getBaseUrl: async () => TEST_BASE_URL,
  };
}

// ---------------------------------------------------------------------------
// Tests — checkAnyProviderConfigured
// ---------------------------------------------------------------------------

describe("checkAnyProviderConfigured", () => {
  it("returns true when at least one provider is configured (array response)", async () => {
    const deps = testDeps(() => Response.json([
      { provider: "anthropic", configured: true },
      { provider: "openai", configured: false },
    ]));

    const result = await checkAnyProviderConfigured(deps);
    expect(result).toBe(true);
  });

  it("returns false when no providers are configured (array response)", async () => {
    const deps = testDeps(() => Response.json([
      { provider: "anthropic", configured: false },
      { provider: "openai", configured: false },
    ]));

    const result = await checkAnyProviderConfigured(deps);
    expect(result).toBe(false);
  });

  it("returns false when provider list is empty (array response)", async () => {
    const deps = testDeps(() => Response.json([]));

    const result = await checkAnyProviderConfigured(deps);
    expect(result).toBe(false);
  });

  it("returns true when at least one provider is configured (object response)", async () => {
    const deps = testDeps(() => Response.json({
      providers: [
        { provider: "anthropic", configured: true },
      ],
    }));

    const result = await checkAnyProviderConfigured(deps);
    expect(result).toBe(true);
  });

  it("returns false when no providers are configured (object response)", async () => {
    const deps = testDeps(() => Response.json({
      providers: [
        { provider: "anthropic", configured: false },
      ],
    }));

    const result = await checkAnyProviderConfigured(deps);
    expect(result).toBe(false);
  });

  it("returns true (fail-open) when daemon returns HTTP error", async () => {
    const deps = testDeps(() => new Response("Internal Server Error", { status: 500 }));

    const result = await checkAnyProviderConfigured(deps);
    expect(result).toBe(true);
  });

  it("returns true (fail-open) when fetch throws (daemon unreachable)", async () => {
    const deps = {
      fetchFn: (() => { throw new Error("Connection refused"); }) as unknown as typeof fetch,
      getBaseUrl: async () => TEST_BASE_URL,
    };

    const result = await checkAnyProviderConfigured(deps);
    expect(result).toBe(true);
  });

  it("returns true (fail-open) when getBaseUrl throws", async () => {
    const deps = {
      fetchFn: createMockFetch(() => Response.json([])),
      getBaseUrl: async () => { throw new Error("No profile store"); },
    };

    const result = await checkAnyProviderConfigured(deps);
    expect(result).toBe(true);
  });

  it("handles missing providers key gracefully", async () => {
    const deps = testDeps(() => Response.json({}));

    const result = await checkAnyProviderConfigured(deps);
    expect(result).toBe(false);
  });

  it("returns true when multiple providers configured", async () => {
    const deps = testDeps(() => Response.json([
      { provider: "anthropic", configured: true },
      { provider: "openai", configured: true },
      { provider: "google", configured: false },
    ]));

    const result = await checkAnyProviderConfigured(deps);
    expect(result).toBe(true);
  });

  it("calls the correct endpoint path", async () => {
    let calledUrl = "";
    const deps = {
      fetchFn: createMockFetch((url) => {
        calledUrl = url;
        return Response.json([]);
      }),
      getBaseUrl: async () => TEST_BASE_URL,
    };

    await checkAnyProviderConfigured(deps);
    expect(calledUrl).toBe(`${TEST_BASE_URL}/api/providers/auth/list`);
  });
});
