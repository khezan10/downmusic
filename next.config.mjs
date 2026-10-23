/** @type {import('next').NextConfig} */
const nextConfig = {
  // ESLint runs as its own step (`npm run lint`) with a flat config that does
  // not pull eslint-config-next's vulnerable glob chain. Next's built-in
  // integration cannot drive eslint 9 in this version, so it is disabled here.
  eslint: { ignoreDuringBuilds: true },
  poweredByHeader: false,
  reactStrictMode: true,
}

export default nextConfig
