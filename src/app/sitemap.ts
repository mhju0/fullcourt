import type { MetadataRoute } from "next";
import { BEHIND_THE_DATA_SECTIONS } from "@/lib/behind-the-data-sections";
import { SITE_URL } from "@/lib/site-url";

/**
 * Every published page, once. `/referees` and `/upcoming` are redirects and are left out, as is
 * the dense referee archive, which is reached from its method page.
 */
const SURFACES = [
  "/",
  "/games",
  "/season",
  "/schedule",
  "/explore",
  "/analysis",
  "/home-court",
  "/shooting",
  "/playoffs",
  "/availability",
  "/shot-quality",
  "/officiating",
  "/about",
  "/how-it-was-built",
  "/data-status",
  "/privacy",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = [...SURFACES, ...BEHIND_THE_DATA_SECTIONS.map((section) => section.href)];
  return [...new Set(paths)].map((path) => ({ url: `${SITE_URL}${path === "/" ? "" : path}` }));
}
