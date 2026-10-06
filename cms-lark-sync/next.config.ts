import type { NextConfig } from "next";

const AGENTS_API = process.env.AGENTS_API_INTERNAL || 'http://100.100.164.92:6004';

const nextConfig: NextConfig = {
  output: 'standalone',
  devIndicators: false,
  eslint: {
    ignoreDuringBuilds: true,
  },
  async rewrites() {
    return [
      // Proxy agents-admin API endpoints (avoids CORS)
      { source: '/api/ba/:path*', destination: `${AGENTS_API}/api/ba/:path*` },
      { source: '/api/n8n/:path*', destination: `${AGENTS_API}/api/n8n/:path*` },
      { source: '/api/auth/:path*', destination: `${AGENTS_API}/api/auth/:path*` },
      { source: '/api/lark-apps/:path*', destination: `${AGENTS_API}/api/lark-apps/:path*` },
    ];
  },
};

export default nextConfig;
