export type Network = "local" | "devnet" | "qanet" | "preview" | "preprod";
export type Status = "idle" | "checking" | "reachable" | "unreachable";

export const NETWORKS: Record<Network, string> = {
  local: "http://localhost:5300/",
  devnet: "https://faucet.devnet.midnight.network/",
  qanet: "https://faucet.qanet.midnight.network/",
  preview: "https://faucet.preview.midnight.network/",
  preprod: "https://faucet.preprod.midnight.network/",
};

export const NETWORK_IDS: Record<string, string> = {
  local: "undeployed",
  devnet: "devnet",
  qanet: "qanet",
  preview: "preview",
  preprod: "preprod",
};

const allOptions: Network[] = ["local", "devnet", "qanet", "preview", "preprod"];

/**
 * The networks anyone may drip from. Everything else is a pre-release chain that
 * only the dev and QA deployments expose, so a public build must never list it.
 */
const publicOptions: Network[] = ["preview", "preprod"];

// Both flags are baked in at build time, so each deployment gets the dropdown its
// audience should see. Absent means the safer answer: a public build, no loopback.
const isLocalBuild = import.meta.env.VITE_IS_LOCAL_BUILD === "true";
const isInternalBuild = import.meta.env.VITE_IS_INTERNAL === "true";

const isOffered = (network: Network): boolean => {
  if (network === "local") return isLocalBuild;
  return isInternalBuild || publicOptions.includes(network);
};

export const OPTIONS: Network[] = allOptions.filter(isOffered);

/**
 * Where every build starts when it can. A local build still opens here rather than
 * on the loopback faucet, which is usually not running.
 */
const preferredDefault: Network = "devnet";

/**
 * The network selected on first load. It has to come from OPTIONS: a public build
 * that opened on devnet would sit on a chain its own dropdown cannot select.
 */
export const DEFAULT_NETWORK: Network = OPTIONS.includes(preferredDefault)
  ? preferredDefault
  : (OPTIONS[0] ?? "preview");
