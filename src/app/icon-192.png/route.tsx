import { maskableIconResponse } from "@/lib/brand/maskable-icon";

// A route handler, not a metadata `icon.tsx`: the manifest needs a stable URL it can
// name, and metadata routes serve extensionless (`/apple-icon`) at a path Next picks.
// The `.png` in the directory name IS the served path — /icon-192.png.
export const dynamic = "force-static";

export function GET() {
  return maskableIconResponse(192);
}
