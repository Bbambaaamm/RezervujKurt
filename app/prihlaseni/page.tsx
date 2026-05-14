export default function LoginPage() {
  return (
    <div className="mx-auto max-w-xl space-y-5 rounded-xl border border-slate-200 bg-white p-6">
      <h1 className="text-2xl font-bold">Přihlášení</h1>
      <p className="text-sm text-slate-600">Přihlaste se přes Google, Apple nebo e-mail. Pro rezervaci je možné pokračovat i jako host.</p>
      <div className="space-y-2">
        <button className="w-full rounded-md border border-slate-300 px-4 py-2 text-left">Pokračovat přes Google</button>
        <button className="w-full rounded-md border border-slate-300 px-4 py-2 text-left">Pokračovat přes Apple</button>
        <button className="w-full rounded-md border border-slate-300 px-4 py-2 text-left">Přihlásit e-mailem</button>
      </div>
    </div>
  );
}
