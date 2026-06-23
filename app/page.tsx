import type { Metadata } from 'next';

import { HomePage } from '@/components/home-page';

export const metadata: Metadata = {
  alternates: {
    canonical: '/',
  },
  openGraph: {
    url: '/',
  },
};

export default function Page() {
  return <HomePage />;
}
