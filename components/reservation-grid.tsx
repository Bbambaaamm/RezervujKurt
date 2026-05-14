import { courts, mockReservations, openHours } from '@/lib/mockData';

const statusClasses: Record<string, string> = {
  volno: 'bg-white',
  potvrzeno: 'bg-emerald-200 text-emerald-900',
  cekajici: 'bg-amber-200 text-amber-900',
  blokace: 'bg-rose-200 text-rose-900',
};

type ReservationGridProps = {
  selectedDate: string;
};

function getSlotStatus(courtId: number, hour: number, date: string) {
  const reservation = mockReservations.find(
    (item) => item.courtId === courtId && item.date === date && hour >= item.fromHour && hour < item.toHour,
  );

  if (!reservation) {
    return { type: 'volno', label: 'Volno' };
  }

  return { type: reservation.status, label: reservation.status === 'cekajici' ? 'Čeká na schválení' : reservation.status === 'potvrzeno' ? 'Obsazeno' : 'Blokace' };
}

export function ReservationGrid({ selectedDate }: ReservationGridProps) {
  const hours = Array.from({ length: openHours.end - openHours.start }, (_, i) => openHours.start + i);

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="grid min-w-[720px] grid-cols-4">
        <div className="border-b border-r border-slate-200 bg-slate-100 p-3 text-sm font-semibold">Čas</div>
        {courts.map((court) => (
          <div key={court.id} className="border-b border-r border-slate-200 bg-slate-100 p-3 text-sm font-semibold last:border-r-0">
            {court.name}
          </div>
        ))}

        {hours.map((hour) => (
          <div key={`row-${hour}`} className="contents">
            <div key={`time-${hour}`} className="border-b border-r border-slate-200 p-3 text-sm font-medium text-slate-700">
              {hour}:00 - {hour + 1}:00
            </div>
            {courts.map((court) => {
              const slot = getSlotStatus(court.id, hour, selectedDate);
              return (
                <button
                  key={`${court.id}-${hour}`}
                  type="button"
                  className={`border-b border-r border-slate-200 p-3 text-left text-xs transition hover:brightness-95 last:border-r-0 ${statusClasses[slot.type]}`}
                >
                  <span className="font-semibold">{slot.label}</span>
                  {slot.type === 'volno' && <p className="mt-1 text-slate-500">Klikněte pro rezervaci</p>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
