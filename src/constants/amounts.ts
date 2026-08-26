export const AMOUNTS = [1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000] as const;
export type Amount = (typeof AMOUNTS)[number];
export const DEFAULT_AMOUNT: Amount = 5000;
