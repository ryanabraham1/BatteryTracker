import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The battery app moved under /battery when fab stock was added; keep old
  // bookmarks and home-screen shortcuts working. `/` itself picks the last-used
  // app (app/(app)/page.tsx).
  async redirects() {
    return [
      { source: "/batteries", destination: "/battery/batteries", permanent: false },
      { source: "/batteries/:path*", destination: "/battery/batteries/:path*", permanent: false },
      { source: "/log", destination: "/battery/log", permanent: false },
      { source: "/comp", destination: "/battery/comp", permanent: false },
      { source: "/settings", destination: "/battery/settings", permanent: false },
    ];
  },
};

export default nextConfig;
