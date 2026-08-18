import { maskableIconResponse } from "@/lib/brand/maskable-icon";

// See icon-192.png/route.tsx. 512 is the size Chromium's richest install prompt reads.
export const dynamic = "force-static";

export function GET() {
  return maskableIconResponse(512);
}
