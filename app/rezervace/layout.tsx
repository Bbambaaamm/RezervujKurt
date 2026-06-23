import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Rezervace kurtů',
  description: 'Vyberte den, volný tenisový kurt TJ Baník Stříbro a odešlete online rezervaci ke schválení.',
  alternates: {
    canonical: '/rezervace',
  },
  openGraph: {
    url: '/rezervace',
    title: 'Rezervace kurtů Stříbro | TJ Baník Stříbro',
    description: 'Online přehled volných termínů a rezervace tenisových kurtů ve Stříbře.',
  },
};

export default function ReservationLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
