import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pravidla rezervací',
  description: 'Provozní pravidla rezervací tenisových kurtů TJ Baník Stříbro.',
  alternates: { canonical: '/pravidla-rezervaci' },
};

export default function ReservationRulesPage() {
  return (
    <article className="mx-auto max-w-3xl space-y-7 rounded-2xl border border-slate-200 bg-white p-5 leading-relaxed shadow-sm sm:p-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-slate-950">Pravidla rezervací</h1>
        <p className="text-slate-600">Rezervační systém je poskytován bezplatně a slouží k rezervaci kurtů TJ Baník Stříbro a zobrazení jejich obsazenosti.</p>
      </header>
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Vytvoření rezervace</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>Rezervaci vytváří přihlášený uživatel pro konkrétní kurt, datum a čas.</li>
          <li>Obsazené termíny a dny blokované turnajem nelze rezervovat.</li>
          <li>Rezervace vzniká ve stavu čekajícím na schválení. Za schvalování rezervací odpovídá správce.</li>
          <li>Poznámku používejte jen pro nezbytnou provozní informaci a nevkládejte do ní citlivé osobní údaje.</li>
        </ul>
      </section>
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Správa a zrušení</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>Vlastní rezervace jsou dostupné na stránce Moje rezervace.</li>
          <li>Budoucí aktivní rezervaci lze v aplikaci zrušit.</li>
          <li>Správce může rezervace spravovat v rozsahu potřebném pro provoz kurtů.</li>
        </ul>
      </section>
    </article>
  );
}
