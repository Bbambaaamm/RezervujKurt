import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <h1 className="text-3xl font-bold">Tenisové kurty TJ Baník Stříbro</h1>
        <p className="max-w-2xl text-slate-700">Moderní a přehledný rezervační systém pro 3 venkovní antukové kurty. Rezervace po hodinách pro členy i hosty.</p>
        <Link href="/rezervace" className="inline-block rounded-md bg-court px-4 py-2 font-medium text-white">Přejít na rezervace</Link>
      </section>
      <section className="grid gap-6 md:grid-cols-3">
        <article className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="font-semibold">Informace o kurtech</h2><p className="mt-2 text-sm text-slate-600">3 antukové venkovní kurty, adresa Palackého 1269, Stříbro.</p></article>
        <article className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="font-semibold">Aktuality</h2><p className="mt-2 text-sm text-slate-600">Připravený prostor pro novinky a turnaje.</p></article>
        <article className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="font-semibold">Fotogalerie</h2><p className="mt-2 text-sm text-slate-600">Místo pro budoucí fotografie areálu.</p></article>
      </section>
    </div>
  );
}
