import { afterEach, describe, expect, it, vi } from "vitest";
import { TURNSTILE_TEST_SITE_KEY } from "../turnstile";

/**
 * The site key is resolved when the module is first evaluated, so the build-time
 * variable has to be stubbed before a fresh copy of the module is pulled in.
 */
const loadSiteKey = async (configured: string | undefined) => {
  vi.stubEnv("VITE_TURNSTILE_SITE_KEY", configured);
  vi.resetModules();
  const { TURNSTILE_SITE_KEY } = await import("../turnstile");
  return TURNSTILE_SITE_KEY;
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("turnstile site keys", () => {
  it("uses the configured site key when the build provides one", async () => {
    await expect(loadSiteKey("0x4AAAAAAAreal")).resolves.toBe("0x4AAAAAAAreal");
  });

  it("falls back to the always-passing test key when none is configured", async () => {
    await expect(loadSiteKey(undefined)).resolves.toBe(TURNSTILE_TEST_SITE_KEY);
  });

  it("exposes Cloudflare's documented always-passes test key", () => {
    expect(TURNSTILE_TEST_SITE_KEY).toBe("1x00000000000000000000AA");
  });
});
