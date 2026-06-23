import type { Metadata } from 'next';
import './globals.css';
import { Header } from '@/components/header';
import { AuthSessionSync } from '@/components/auth-session-sync';

const siteUrl = new URL('https://rezervuj-kurt.vercel.app');

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: {
    default: 'Rezervace kurtů Stříbro | TJ Baník Stříbro',
    template: '%s | Rezervace kurtů Stříbro',
  },
  description: 'Online rezervační systém pro tenisové kurty TJ Baník Stříbro. Rychlá rezervace kurtu ve Stříbře a přehled dostupných termínů.',
  keywords: [
    'rezervace kurty Stříbro',
    'rezervace kurtů Stříbro',
    'tenisové kurty Stříbro',
    'TJ Baník Stříbro tenis',
    'online rezervace kurtu',
  ],
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'cs_CZ',
    url: '/',
    siteName: 'Rezervace kurtů Stříbro',
    title: 'Rezervace kurtů Stříbro | TJ Baník Stříbro',
    description: 'Online rezervace tenisových kurtů TJ Baník Stříbro s přehledem volných termínů.',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="cs">
      <body>
        <AuthSessionSync />
        <Header />
        <main className="mx-auto max-w-6xl px-4 py-5">{children}</main>
      </body>
    </html>
  );
}
