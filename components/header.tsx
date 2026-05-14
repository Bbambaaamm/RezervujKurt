import Link from 'next/link';

const links = [
  { href: '/', label: 'Domů' },
  { href: '/rezervace', label: 'Rezervace' },
  { href: '/prihlaseni', label: 'Přihlášení' },
  { href: '/admin', label: 'Admin' },
];

export function Header() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <div>
          <p className="text-lg font-semibold">RezervujKurt</p>
          <p className="text-sm text-slate-600">TJ Baník Stříbro</p>
        </div>
        <nav className="flex gap-4 text-sm font-medium">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="text-slate-700 transition hover:text-court">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
