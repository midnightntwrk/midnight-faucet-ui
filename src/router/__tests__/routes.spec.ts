import { describe, expect, it } from "vitest";
import { ROUTES } from "../routes";
import { NETWORKS, type Network } from "../../constants";

const ALL_NETWORKS = Object.keys(NETWORKS) as Network[];

describe("ROUTES — faucet endpoints", () => {
  it.each(ALL_NETWORKS)("builds every faucet endpoint on the %s base URL", (chain) => {
    const base = NETWORKS[chain];

    expect(ROUTES.getHealth({ chain })).toBe(`${base}api/health`);
    expect(ROUTES.getReady({ chain })).toBe(`${base}api/ready`);
    expect(ROUTES.postDrip({ chain })).toBe(`${base}api/drips`);
    expect(ROUTES.getDripStatus({ chain, dripId: "drip-1" })).toBe(`${base}api/drips/drip-1`);
  });

  it("keeps a single slash between the base URL and the path", () => {
    for (const chain of ALL_NETWORKS) {
      expect(ROUTES.getHealth({ chain })).not.toContain("//api");
    }
  });

  it("addresses a specific drip by id", () => {
    expect(ROUTES.getDripStatus({ chain: "devnet", dripId: "abc-123" })).toBe(
      "https://faucet.devnet.midnight.network/api/drips/abc-123",
    );
  });
});

describe("ROUTES — explorer links", () => {
  it("points at the explorer subdomain for the chain", () => {
    expect(ROUTES.getExplorerLink({ chain: "preview", txId: "0xabc" })).toBe(
      "https://preview.midnightexplorer.com/transactions/0xabc",
    );
    expect(ROUTES.getExplorerLink({ chain: "qanet", txId: "0xdef" })).toBe(
      "https://qanet.midnightexplorer.com/transactions/0xdef",
    );
  });

  it("builds an explorer link for every network", () => {
    for (const chain of ALL_NETWORKS) {
      expect(ROUTES.getExplorerLink({ chain, txId: "0x1" })).toBe(
        `https://${chain}.midnightexplorer.com/transactions/0x1`,
      );
    }
  });
});
