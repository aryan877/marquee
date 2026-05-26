import type { NextConfig } from 'next';
import { resolve } from 'node:path';

const nextConfig: NextConfig = {
  typedRoutes: true,
  turbopack: {
    root: resolve(__dirname, '..', '..'),
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.r2.dev' },
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
  },
  transpilePackages: ['@marquee/db', '@marquee/shared'],
};

export default nextConfig;
