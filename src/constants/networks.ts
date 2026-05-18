export type Network = "local" | "devnet" | "qanet" | "preview" | "preprod";
export type Status = "idle" | "checking" | "reachable" | "unreachable";

export const NETWORKS: Record<Network, string> = {
  local: "http://localhost:5300/",
  devnet: "https://faucet.devnet.midnight.network/",
  qanet: "https://faucet.qanet.midnight.network/",
  preview: "https://faucet.preview.midnight.network/",
  preprod: "https://faucet.preprod.midnight.network/",
};

const allOptions: Network[] = ["local", "devnet", "qanet", "preview", "preprod"];
export const OPTIONS: Network[] = import.meta.env.VITE_IS_LOCAL_BUILD === "true"
  ? allOptions
  : allOptions.filter((n) => n !== "local");
