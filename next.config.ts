import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**.supabase.co", pathname: "/storage/v1/object/public/**" }],
  },
  outputFileTracingExcludes: {
    "*": ["./public/question-bank/files/**/*", "./.local-backups/**/*"],
  },
};

export default nextConfig;
