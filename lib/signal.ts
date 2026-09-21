/** How strong is the evidence for a connection, as 1–3? Pure (no dictionaries), so client components can use it. */
export function signalLevel(confidence: number): 1 | 2 | 3 {
  if (confidence >= 0.74) return 3;
  if (confidence >= 0.6) return 2;
  return 1;
}
