import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  images: {
    domains: [
      "lh3.googleusercontent.com",
      "www.svgrepo.com",
      "via.placeholder.com"
    ],
  },
};

export default nextConfig;
