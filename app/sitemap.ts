import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date("2026-08-10T00:00:00-03:00");

  return [
    {
      url: "https://futbobo.top/",
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: "https://futbobo.top/copa/",
      lastModified,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: "https://futbobo.top/botao/",
      lastModified,
      changeFrequency: "monthly",
      priority: 0.7,
    },
  ];
}
