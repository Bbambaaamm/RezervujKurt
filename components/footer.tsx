import Link from 'next/link';

const footerLinks = [
  { href: '/pravidla-rezervaci', label: 'Pravidla rezervací' },
  { href: '/ochrana-osobnich-udaju', label: 'Ochrana osobních údajů' },
];

export function Footer() {
  return (
    <footer className="mt-8 border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
        <p>RezervujKurt · TJ Baník Stříbro</p>
        <nav aria-label="Právní a kontaktní informace" className="flex flex-wrap gap-x-4 gap-y-2">
          {footerLinks.map((link) => (
            <Link key={link.href} href={link.href} className="underline decoration-slate-300 underline-offset-4 hover:text-court">
              {link.label}
            </Link>
          ))}
          <span>Kontakt: [DOPLNIT KONTAKT]</span>
        </nav>
      </div>
    </footer>
  );
}
