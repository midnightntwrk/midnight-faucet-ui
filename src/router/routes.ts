import { NETWORKS, type Network } from "../constants";

export const ROUTES = {
  getHealth: ({ chain }: { chain: Network }) => `${NETWORKS[chain]}api/health`,
  getReady: ({ chain }: { chain: Network }) => `${NETWORKS[chain]}api/ready`,
  postDrip: ({ chain }: { chain: Network }) => `${NETWORKS[chain]}api/drips`,
  getDripStatus: ({ chain, dripId }: { chain: Network; dripId: string }) =>
    `${NETWORKS[chain]}api/drips/${dripId}`,
};

export type HealthResponse =
  | { status: "SERVING"; reason: null }
  | {
      status: "NOT_SERVING";
      reason:
        | "SERVICES_DOWN"
        | "SYNC_STUCK_RECOVERY"
        | "STATE_PERSISTENCE_FAILURE"
        | "SYNC_BEHIND"
        | "WALLET_BALANCE_LOW"
        | "INTERNAL_ERROR";
    };

export type ReadyResponse =
  | { status: "ok"; details: Record<string, "ok"> }
  | { status: "not_ok"; details: Record<string, "not_ok" | "ok"> };
