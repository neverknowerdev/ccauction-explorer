/** @type {import('next').NextConfig} */
const nextConfig = {
    experimental: {
        serverComponentsExternalPackages: ['node-telegram-bot-api'],
    },
};

export default nextConfig;
