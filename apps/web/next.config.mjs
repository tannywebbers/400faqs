/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  // Allow the Base44 preview origin (changes whenever the env is recreated).
  allowedDevOrigins: process.env.BASE44_PUBLIC_HOST_SUFFIX
    ? [`https://3000-${process.env.BASE44_PUBLIC_HOST_SUFFIX}`]
    : [],
  // The Base44 proxy sets x-forwarded-host to the internal sandbox host, which
  // differs from the browser's origin (the external preview host). Without
  // listing the preview host here, Next.js rejects Server Actions POSTs as
  // "Invalid Server Actions request" (CSRF origin mismatch).
  experimental: {
    serverActions: {
      allowedOrigins: process.env.BASE44_PUBLIC_HOST_SUFFIX
        ? [`3000-${process.env.BASE44_PUBLIC_HOST_SUFFIX}`]
        : [],
    },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "**" },
    ],
  },
};

export default nextConfig;
