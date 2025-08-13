/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Zama FHE SDK 所需的安全头
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
          {
            key: 'Cross-Origin-Embedder-Policy',
            value: 'require-corp',
          },
        ],
      },
      // 开发环境：为 Next.js 内部资源提供例外，避免影响 HMR
      {
        source: '/_next/:path*',
        headers: [
          {
            key: 'Cross-Origin-Embedder-Policy',
            value: 'unsafe-none',
          },
        ],
      },
      {
        source: '/__nextjs_original-stack-frame',
        headers: [
          {
            key: 'Cross-Origin-Embedder-Policy',
            value: 'unsafe-none',
          },
        ],
      },

      {
        source: '/ws',
        headers: [
          {
            key: 'Cross-Origin-Embedder-Policy',
            value: 'unsafe-none',
          },
        ],
      },
    ];
  },

  
  
  compiler: {
    removeConsole: process.env.NODE_ENV === "production" ? {
      exclude: ['error', 'warn'] // 保留error和warn
    } : false,
  },

  // 性能优化
  experimental: {
    forceSwcTransforms: true,
  },

  webpack: (config, { dev, isServer }) => {
   
    if (!dev && !isServer) {
     
      config.optimization = {
        ...config.optimization,
        usedExports: true,
        sideEffects: false,
      };
    }

    return config;
  },

  
  images: {
    domains: [],
  },
};

module.exports = nextConfig;