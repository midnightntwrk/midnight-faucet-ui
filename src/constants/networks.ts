export type Network = "devnet" | "qanet" | "preview" | "preprod";
export type Status = "idle" | "checking" | "reachable" | "unreachable";

export const NETWORKS: Record<Network, string> = {
  devnet: "https://faucet.devnet.midnight.network/",
  qanet: "https://faucet.qanet.midnight.network/",
  preview: "https://faucet.preview.midnight.network/",
  preprod: "https://faucet.preprod.midnight.network/",
};

export const OPTIONS: Network[] = ["devnet", "qanet", "preview", "preprod"];
