import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

// Deploy under https://<user>.github.io/unffi/ on CI; serve at root locally.
const isProd = process.env.NODE_ENV === 'production';
const basePath = isProd ? '/unffi' : '';

/** @type {import('next').NextConfig} */
const config = {
  output: 'export',
  reactStrictMode: true,
  basePath,
  assetPrefix: basePath || undefined,
  images: {
    unoptimized: true,
  },
};

export default withMDX(config);
