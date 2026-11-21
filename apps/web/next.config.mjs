/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@ai-content-os/shared'],
};

export default nextConfig;
