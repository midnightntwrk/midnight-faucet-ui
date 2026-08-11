import { afterEach, describe, expect, it, vi } from "vitest";
import { NETWORKS, NETWORK_IDS, type Network } from "../networks";

const ALL_NETWORKS = Object.keys(NETWORKS) as Network[];

/**
 * OPTIONS is decided when the module is first evaluated, so the build flag has to
 * be stubbed before a fresh copy of the module is pulled in.
 */
const loadOptions = async (isLocalBuild: string | undefined) => {
  vi.stubEnv("VITE_IS_LOCAL_BUILD", isLocalBuild);
  vi.resetModules();
  const { OPTIONS } = await import("../networks");
  return OPTIONS;
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("NETWORKS", () => {
  it("covers every network the app knows about", () => {
    expect(ALL_NETWORKS).toEqual(["local", "devnet", "stagenet", "qanet", "preview", "preprod"]);
  });

  it("ends every base URL with a slash so route builders can append paths directly", () => {
    for (const network of ALL_NETWORKS) {
      expect(NETWORKS[network]).toMatch(/\/$/);
    }
  });

  it("serves every deployed network over https", () => {
    for (const network of ALL_NETWORKS.filter((n) => n !== "local")) {
      expect(NETWORKS[network]).toMatch(/^https:\/\//);
    }
  });

  it("points local at the loopback faucet", () => {
    expect(NETWORKS.local).toBe("http://localhost:5300/");
  });

  it("maps local to the undeployed network id", () => {
    expect(NETWORK_IDS.local).toBe("undeployed");
  });

  it("maps every other network id to its own name", () => {
    for (const network of ALL_NETWORKS.filter((n) => n !== "local")) {
      expect(NETWORK_IDS[network]).toBe(network);
    }
  });
});

describe("OPTIONS", () => {
  it("offers the local faucet only in a local build", async () => {
    await expect(loadOptions("true")).resolves.toContain("local");
  });

  it("hides the local faucet from deployed builds", async () => {
    await expect(loadOptions(undefined)).resolves.not.toContain("local");
    await expect(loadOptions("false")).resolves.not.toContain("local");
  });

  it("keeps the networks in their declared order", async () => {
    await expect(loadOptions("true")).resolves.toEqual(ALL_NETWORKS);
    await expect(loadOptions("false")).resolves.toEqual(
      ALL_NETWORKS.filter((n) => n !== "local"),
    );
  });
});
