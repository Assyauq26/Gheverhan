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
        "gheverhan.netlify.app",
        "*.gheverhan.netlify.app",
        "c1a44360-8add-4348-ab72-5392b5c2976b.preview.emergentagent.com",
        "c1a44360-8add-4348-ab72-5392b5c2976b.cluster-12.preview.emergentcf.cloud",
        "*.preview.emergentagent.com",
        "*.preview.emergentcf.cloud",
        "localhost:3000",
      ],
    },
  },
};

module.exports = nextConfig;
