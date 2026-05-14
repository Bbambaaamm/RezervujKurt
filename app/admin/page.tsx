export default function AdminPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Administrace</h1>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold">Rezervace</h2>
          <p className="mt-2 text-sm text-slate-600">Filtrace dle data a stavu, schválení, zamítnutí a ruční zásahy.</p>
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold">Uživatelé a členství</h2>
          <p className="mt-2 text-sm text-slate-600">Správa uživatelů a označení účtu jako člen.</p>
        </section>
      </div>
    </div>
  );
}
