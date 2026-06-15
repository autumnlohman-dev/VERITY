import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }],
  },
  // heic-convert → libheif-js loads its WASM at runtime via __dirname/readFileSync.
  // If Next bundled it into the route handler, libheif.wasm would no longer sit
  // beside the loader and HEIC decode would throw in production. Keeping these
  // external leaves them as runtime requires from node_modules (and lets Next's
  // output-file-tracing ship libheif.wasm alongside), so HEIC→JPEG works on Vercel.
  serverExternalPackages: ["heic-convert", "libheif-js"],
};
export default nextConfig;
