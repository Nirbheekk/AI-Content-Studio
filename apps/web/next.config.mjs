/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(process.platform !== 'win32' || process.env['NEXT_OUTPUT_STANDALONE'] === 'true'
    ? { output: 'standalone' }
    : {}),
  transpilePackages: ['@ai-content-os/shared'],
};

export default nextConfig;
