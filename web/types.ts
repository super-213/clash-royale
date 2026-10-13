import type { Release } from "../shared/schema";
export type View = "brief" | "decks" | "cards" | "balance" | "sources";
export type Run = {
  source: string;
  status: string;
  count: number;
  finished_at: string;
  message: string;
};
export type Status = { heads: Release[]; decks: number; runs: Run[] };
