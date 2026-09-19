import type { DiscoveryResult } from "@/lib/discovery";

/** Shared shape for the wish form ("use server" files may only export async functions). */
export interface WishState {
  status: "idle" | "error" | "ok";
  error?: string;
  result?: DiscoveryResult;
  /** Echoed back so the form keeps what the person typed. */
  values: { wish: string; outcome: string; domain: string; scope: string; offer: string };
}

export const initialWishState: WishState = {
  status: "idle",
  values: { wish: "", outcome: "", domain: "", scope: "", offer: "" },
};
