import { describe, expect, it } from "bun:test";

import {
  classifyFetchError,
  diagnoseHealthFailure,
} from "../../../src/components/onboarding/steps/daemon-install-step";

// ---------------------------------------------------------------------------
// classifyFetchError
// ---------------------------------------------------------------------------

describe("classifyFetchError", () => {
  it("returns 'connection-refused' for ECONNREFUSED code", () => {
    const error = Object.assign(new Error("connect failed"), { code: "ECONNREFUSED" });
    expect(classifyFetchError(error)).toBe("connection-refused");
  });

  it("returns 'connection-refused' for message containing 'connection refused'", () => {
    const error = new Error("Connection refused at 127.0.0.1:7433");
    expect(classifyFetchError(error)).toBe("connection-refused");
  });

  it("returns 'connection-refused' for message containing 'econnrefused'", () => {
    const error = new Error("fetch failed: ECONNREFUSED");
    expect(classifyFetchError(error)).toBe("connection-refused");
  });

  it("returns 'timeout' for AbortError", () => {
    const error = new DOMException("The operation was aborted", "AbortError");
    expect(classifyFetchError(error)).toBe("timeout");
  });

  it("returns 'timeout' for TimeoutError", () => {
    const error = new DOMException("The operation timed out", "TimeoutError");
    expect(classifyFetchError(error)).toBe("timeout");
  });

  it("returns 'timeout' for ETIMEDOUT code", () => {
    const error = Object.assign(new Error("timed out"), { code: "ETIMEDOUT" });
    expect(classifyFetchError(error)).toBe("timeout");
  });

  it("returns 'timeout' for message containing 'timed out'", () => {
    const error = new Error("Request timed out after 3000ms");
    expect(classifyFetchError(error)).toBe("timeout");
  });

  it("returns 'port-in-use' for EADDRINUSE code", () => {
    const error = Object.assign(new Error("bind failed"), { code: "EADDRINUSE" });
    expect(classifyFetchError(error)).toBe("port-in-use");
  });

  it("returns 'port-in-use' for message containing 'address already in use'", () => {
    const error = new Error("listen EADDRINUSE: address already in use :::7433");
    expect(classifyFetchError(error)).toBe("port-in-use");
  });

  it("returns 'unknown' for generic errors", () => {
    const error = new Error("Something went wrong");
    expect(classifyFetchError(error)).toBe("unknown");
  });

  it("returns 'unknown' for non-Error values", () => {
    expect(classifyFetchError("string error")).toBe("unknown");
    expect(classifyFetchError(42)).toBe("unknown");
    expect(classifyFetchError(null)).toBe("unknown");
    expect(classifyFetchError(undefined)).toBe("unknown");
  });
});

// ---------------------------------------------------------------------------
// diagnoseHealthFailure
// ---------------------------------------------------------------------------

describe("diagnoseHealthFailure", () => {
  function rejected(error: unknown): PromiseSettledResult<boolean> {
    return { status: "rejected", reason: error };
  }

  function fulfilled(value: boolean): PromiseSettledResult<boolean> {
    return { status: "fulfilled", value };
  }

  it("returns connection-refused diagnostic when any error is ECONNREFUSED", () => {
    const results: PromiseSettledResult<boolean>[] = [
      rejected(Object.assign(new Error("fail"), { code: "ECONNREFUSED" })),
      rejected(new DOMException("aborted", "AbortError")),
      rejected(new Error("unknown")),
    ];

    const diagnostic = diagnoseHealthFailure(results);
    expect(diagnostic.kind).toBe("connection-refused");
    expect(diagnostic.message).toContain("Connection refused");
    expect(diagnostic.hint).toContain("reins daemon start");
  });

  it("returns timeout diagnostic when errors are timeouts (no connection-refused)", () => {
    const results: PromiseSettledResult<boolean>[] = [
      rejected(new DOMException("aborted", "AbortError")),
      rejected(new DOMException("aborted", "TimeoutError")),
      rejected(new DOMException("aborted", "AbortError")),
    ];

    const diagnostic = diagnoseHealthFailure(results);
    expect(diagnostic.kind).toBe("timeout");
    expect(diagnostic.message).toContain("timed out");
    expect(diagnostic.hint).toContain("firewall");
  });

  it("returns port-in-use diagnostic when EADDRINUSE present (no higher priority)", () => {
    const results: PromiseSettledResult<boolean>[] = [
      rejected(Object.assign(new Error("fail"), { code: "EADDRINUSE" })),
      rejected(new Error("unknown")),
    ];

    const diagnostic = diagnoseHealthFailure(results);
    expect(diagnostic.kind).toBe("port-in-use");
    expect(diagnostic.message).toContain("Port 7433");
    expect(diagnostic.hint).toContain("conflicting service");
  });

  it("returns unknown diagnostic when all errors are unclassified", () => {
    const results: PromiseSettledResult<boolean>[] = [
      rejected(new Error("something")),
      rejected(new Error("else")),
    ];

    const diagnostic = diagnoseHealthFailure(results);
    expect(diagnostic.kind).toBe("unknown");
    expect(diagnostic.hint).toContain("logs");
  });

  it("prioritizes connection-refused over timeout", () => {
    const results: PromiseSettledResult<boolean>[] = [
      rejected(new DOMException("aborted", "AbortError")),
      rejected(Object.assign(new Error("fail"), { code: "ECONNREFUSED" })),
    ];

    const diagnostic = diagnoseHealthFailure(results);
    expect(diagnostic.kind).toBe("connection-refused");
  });

  it("prioritizes timeout over port-in-use", () => {
    const results: PromiseSettledResult<boolean>[] = [
      rejected(Object.assign(new Error("fail"), { code: "EADDRINUSE" })),
      rejected(new DOMException("aborted", "AbortError")),
    ];

    const diagnostic = diagnoseHealthFailure(results);
    expect(diagnostic.kind).toBe("timeout");
  });

  it("ignores fulfilled results when diagnosing", () => {
    const results: PromiseSettledResult<boolean>[] = [
      fulfilled(false),
      rejected(Object.assign(new Error("fail"), { code: "ECONNREFUSED" })),
      fulfilled(false),
    ];

    const diagnostic = diagnoseHealthFailure(results);
    expect(diagnostic.kind).toBe("connection-refused");
  });

  it("returns unknown when all results are fulfilled (no rejections)", () => {
    const results: PromiseSettledResult<boolean>[] = [
      fulfilled(false),
      fulfilled(false),
    ];

    const diagnostic = diagnoseHealthFailure(results);
    expect(diagnostic.kind).toBe("unknown");
  });
});
