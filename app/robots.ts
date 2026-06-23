import type { MetadataRoute } from 'next';

const siteUrl = 'https://rezervuj-kurt.vercel.app';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/ucet', '/moje-rezervace'],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
