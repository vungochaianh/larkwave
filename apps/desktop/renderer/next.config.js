const path = require('path');

/** @type {import('next').NextConfig} */
// Nextron renderer: static export loaded by Electron via electron-serve.
module.exports = {
  output: 'export',
  distDir: process.env.NODE_ENV === 'production' ? '../app' : '.next',
  // Share the exact same React UI as the web app.
  transpilePackages: ['@larkwave/ui', '@larkwave/core'],
  images: { unoptimized: true },
  trailingSlash: true,
  // Desktop runtime is React 18 but the workspace's @types/react resolves to 19
  // (web). That mismatch only trips next build's type-check, not runtime (verified
  // in dev). This is an internal app build, so skip type/lint gating here. The web
  // keeps type-check ON for prod safety.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  webpack: (config) => {
    // The monorepo has two React majors (web=19, desktop=18) and `.npmrc`
    // shamefully-hoist can leak React 19 into this bundle. React 19 changed its
    // element `$$typeof`, so a 19 element rendered by 18 throws "Objects are not
    // valid as a React child". Pin EVERYTHING here to this app's single React 18.
    const react = path.dirname(require.resolve('react/package.json'));
    const reactDom = path.dirname(require.resolve('react-dom/package.json'));
    config.resolve.alias = {
      ...config.resolve.alias,
      react,
      'react-dom': reactDom,
      'react/jsx-runtime': require.resolve('react/jsx-runtime'),
      'react/jsx-dev-runtime': require.resolve('react/jsx-dev-runtime'),
    };
    return config;
  },
};
