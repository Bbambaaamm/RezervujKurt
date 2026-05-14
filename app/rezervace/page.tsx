import { ReservationGrid } from '@/components/reservation-grid';

export default function ReservationPage() {
  const selectedDate = '2026-05-14';

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-3xl font-bold">Rezervace kurtů</h1>
          <p className="text-slate-600">Denní přehled všech 3 kurtů na jednom místě.</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm">
          Datum: <span className="font-semibold">14. 5. 2026</span>
        </div>
      </div>

      <ReservationGrid selectedDate={selectedDate} />

      <section className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm md:grid-cols-3">
        <p><span className="inline-block h-3 w-3 rounded-full bg-white ring-1 ring-slate-300" /> Volný slot</p>
        <p><span className="inline-block h-3 w-3 rounded-full bg-emerald-200" /> Potvrzená rezervace</p>
        <p><span className="inline-block h-3 w-3 rounded-full bg-amber-200" /> Čeká na schválení</p>
      </section>
    </div>
  );
}
