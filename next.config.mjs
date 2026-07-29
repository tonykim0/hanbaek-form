/** @type {import('next').NextConfig} */
const nextConfig = {
  // PDF 업로드를 위해 body 크기 제한 완화
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
    // heic-convert(libheif wasm)는 번들링하지 않고 런타임에 node_modules에서 로드
    serverComponentsExternalPackages: ['heic-convert'],
  },
};

export default nextConfig;
