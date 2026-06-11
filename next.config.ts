import type { NextConfig } from 'next';

const codespaceName = process.env.CODESPACE_NAME?.trim();
const codespacesForwardingDomain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN?.trim();
const codespacesDevOrigin = codespaceName && codespacesForwardingDomain
  ? `${codespaceName}-3000.${codespacesForwardingDomain}`
  : undefined;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: [
    '127.0.0.1',
    ...(codespacesDevOrigin ? [codespacesDevOrigin] : []),
  ],
};

export default nextConfig;
