import { afterEach, describe, expect, it, vi } from "vitest";
import { NETWORKS, NETWORK_IDS, type Network } from "../networks";

const ALL_NETWORKS = Object.keys(NETWORKS) as Network[];

const INTERNAL_ONLY: Network[] = ["devnet", "stagenet", "qanet"];
const PUBLIC_ONLY: Network[] = ["preview", "preprod"];

/**
 * OPTIONS is decided when the module is first evaluated, so the build flags have
 * to be stubbed before a fresh copy of the module is pulled in.
 */
const loadNetworks = async (flags: { isLocalBuild?: string; isInternal?: string }) => {
  vi.stubEnv("VITE_IS_LOCAL_BUILD", flags.isLocalBuild);
  vi.stubEnv("VITE_IS_INTERNAL", flags.isInternal);
  vi.resetModules();
  return import("../networks");
};

const loadOptions = async (isLocalBuild: string | undefined) =>
  (await loadNetworks({ isLocalBuild, isInternal: "true" })).OPTIONS;

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

describe("OPTIONS — internal and public builds", () => {
  it("offers a public build nothing but the public networks", async () => {
    for (const isInternal of [undefined, "false"]) {
      const { OPTIONS } = await loadNetworks({ isInternal });
      expect(OPTIONS).toEqual(PUBLIC_ONLY);
    }
  });

  it("adds the pre-release networks to an internal build", async () => {
    const { OPTIONS } = await loadNetworks({ isInternal: "true" });

    expect(OPTIONS).toEqual([...INTERNAL_ONLY, ...PUBLIC_ONLY]);
  });

  it("keeps the public networks reachable from an internal build", async () => {
    const { OPTIONS } = await loadNetworks({ isInternal: "true" });

    for (const network of PUBLIC_ONLY) expect(OPTIONS).toContain(network);
  });

  it("hides the loopback faucet from both builds unless it is a local build", async () => {
    for (const isInternal of ["true", "false"]) {
      const { OPTIONS } = await loadNetworks({ isInternal });
      expect(OPTIONS).not.toContain("local");
    }

    const { OPTIONS } = await loadNetworks({ isLocalBuild: "true", isInternal: "true" });
    expect(OPTIONS).toContain("local");
  });

  it("never leaks a pre-release network into a public build", async () => {
    const { OPTIONS } = await loadNetworks({ isLocalBuild: "true", isInternal: "false" });

    for (const network of INTERNAL_ONLY) expect(OPTIONS).not.toContain(network);
  });
});

describe("DEFAULT_NETWORK", () => {
  it("starts a public build on a network its dropdown actually offers", async () => {
    const { DEFAULT_NETWORK, OPTIONS } = await loadNetworks({ isInternal: "false" });

    expect(DEFAULT_NETWORK).toBe("preview");
    expect(OPTIONS).toContain(DEFAULT_NETWORK);
  });

  it("starts an internal build on devnet", async () => {
    const { DEFAULT_NETWORK } = await loadNetworks({ isInternal: "true" });

    expect(DEFAULT_NETWORK).toBe("devnet");
  });

  it("keeps a local build off the loopback faucet, which is rarely running", async () => {
    const { DEFAULT_NETWORK } = await loadNetworks({
      isLocalBuild: "true",
      isInternal: "true",
    });

    expect(DEFAULT_NETWORK).toBe("devnet");
  });

  it("always names a network the dropdown offers", async () => {
    for (const isInternal of ["true", "false"]) {
      const { DEFAULT_NETWORK, OPTIONS } = await loadNetworks({ isInternal });
      expect(OPTIONS).toContain(DEFAULT_NETWORK);
    }
  });
});
