/** @type {import('next').NextConfig} */
const nextConfig = {
  // PDF 업로드를 위해 body 크기 제한 완화
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
};

export default nextConfig;
