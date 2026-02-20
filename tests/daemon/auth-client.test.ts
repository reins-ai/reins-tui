import { describe, expect, it } from "bun:test";

import { DaemonAuthClient } from "../../src/daemon/auth-client";

function createMockFetch(responses: Map<string, { status: number; body: unknown }>): typeof fetch {
  return async (input: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    for (const [pattern, response] of responses) {
      if (url.includes(pattern)) {
        return new Response(JSON.stringify(response.body), {
          status: response.status,
          headers: { "content-type": "application/json" },
        });
      }
    }

    return new Response("Not Found", { status: 404 });
  };
}

describe("DaemonAuthClient", () => {
  describe("requestDeviceCode", () => {
    it("returns device code on success", async () => {
      const mockFetch = createMockFetch(new Map([
        ["/auth/device-code", {
          status: 200,
          body: {
            code: "123456",
            verificationUrl: "https://example.com/device-auth?code=123456",
            expiresAt: 1700000000000,
          },
        }],
      ]));

      const client = new DaemonAuthClient({
        baseUrl: "http://localhost:7433",
        fetchImpl: mockFetch,
      });

      const result = await client.requestDeviceCode();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.code).toBe("123456");
        expect(result.value.verificationUrl).toBe("https://example.com/device-auth?code=123456");
        expect(result.value.expiresAt).toBe(1700000000000);
      }
    });

    it("returns error on server failure", async () => {
      const mockFetch = createMockFetch(new Map([
        ["/auth/device-code", { status: 500, body: { error: "Internal error" } }],
      ]));

      const client = new DaemonAuthClient({
        baseUrl: "http://localhost:7433",
        fetchImpl: mockFetch,
      });

      const result = await client.requestDeviceCode();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("DAEMON_INTERNAL_ERROR");
        expect(result.error.retryable).toBe(true);
      }
    });

    it("returns error on network failure", async () => {
      const failFetch = async (): Promise<Response> => {
        throw new Error("Connection refused");
      };

      const client = new DaemonAuthClient({
        baseUrl: "http://localhost:7433",
        fetchImpl: failFetch as typeof fetch,
      });

      const result = await client.requestDeviceCode();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("DAEMON_UNAVAILABLE");
        expect(result.error.retryable).toBe(true);
      }
    });
  });

  describe("pollDeviceCodeStatus", () => {
    it("returns pending status", async () => {
      const mockFetch = createMockFetch(new Map([
        ["/auth/device-code/123456/status", {
          status: 200,
          body: { status: "pending", expiresAt: 1700000000000 },
        }],
      ]));

      const client = new DaemonAuthClient({
        baseUrl: "http://localhost:7433",
        fetchImpl: mockFetch,
      });

      const result = await client.pollDeviceCodeStatus("123456");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe("pending");
        expect(result.value.expiresAt).toBe(1700000000000);
      }
    });

    it("returns verified status with session token", async () => {
      const mockFetch = createMockFetch(new Map([
        ["/auth/device-code/ABC123/status", {
          status: 200,
          body: { status: "verified", sessionToken: "rcs_session_token_xyz" },
        }],
      ]));

      const client = new DaemonAuthClient({
        baseUrl: "http://localhost:7433",
        fetchImpl: mockFetch,
      });

      const result = await client.pollDeviceCodeStatus("ABC123");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe("verified");
        expect(result.value.sessionToken).toBe("rcs_session_token_xyz");
      }
    });

    it("returns expired status", async () => {
      const mockFetch = createMockFetch(new Map([
        ["/auth/device-code/EXPIRED/status", {
          status: 200,
          body: { status: "expired", expiresAt: 1699999999000 },
        }],
      ]));

      const client = new DaemonAuthClient({
        baseUrl: "http://localhost:7433",
        fetchImpl: mockFetch,
      });

      const result = await client.pollDeviceCodeStatus("EXPIRED");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe("expired");
      }
    });

    it("encodes the code in the URL path", async () => {
      let capturedUrl = "";
      const captureFetch = async (input: string | URL | Request): Promise<Response> => {
        capturedUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        return new Response(JSON.stringify({ status: "pending" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      };

      const client = new DaemonAuthClient({
        baseUrl: "http://localhost:7433",
        fetchImpl: captureFetch as typeof fetch,
      });

      await client.pollDeviceCodeStatus("AB/CD");
      expect(capturedUrl).toContain("/auth/device-code/AB%2FCD/status");
    });

    it("returns error on 404", async () => {
      const mockFetch = createMockFetch(new Map([
        // No matching route — will return 404
      ]));

      const client = new DaemonAuthClient({
        baseUrl: "http://localhost:7433",
        fetchImpl: mockFetch,
      });

      const result = await client.pollDeviceCodeStatus("UNKNOWN");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("DAEMON_NOT_FOUND");
        expect(result.error.retryable).toBe(false);
      }
    });
  });

  describe("constructor", () => {
    it("strips trailing slash from base URL", async () => {
      let capturedUrl = "";
      const captureFetch = async (input: string | URL | Request): Promise<Response> => {
        capturedUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        return new Response(JSON.stringify({ code: "X", verificationUrl: "Y", expiresAt: 0 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      };

      const client = new DaemonAuthClient({
        baseUrl: "http://localhost:7433/",
        fetchImpl: captureFetch as typeof fetch,
      });

      await client.requestDeviceCode();
      expect(capturedUrl).toBe("http://localhost:7433/auth/device-code");
    });
  });
});
