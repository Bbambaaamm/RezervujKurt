import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Přihlášení',
  description: 'Přihlášení do rezervačního systému tenisových kurtů TJ Baník Stříbro.',
  alternates: {
    canonical: '/prihlaseni',
  },
  openGraph: {
    url: '/prihlaseni',
    title: 'Přihlášení | Rezervace kurtů Stříbro',
    description: 'Přihlášení pro vytvoření a správu rezervací tenisových kurtů TJ Baník Stříbro.',
  },
};

export default function LoginLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
