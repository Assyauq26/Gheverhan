/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
  experimental: {
    serverActions: {
      allowedOrigins: [
        "c1a44360-8add-4348-ab72-5392b5c2976b.preview.emergentagent.com",
        "localhost:3000",
      ],
    },
  },
};

module.exports = nextConfig;
