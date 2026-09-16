/** Connectivity probe for the offline poller. No auth, no body, never cached. */
export function HEAD() {
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
export const GET = HEAD;
