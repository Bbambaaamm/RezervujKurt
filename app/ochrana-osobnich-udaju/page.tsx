import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Ochrana osobních údajů',
  description: 'Informace o zpracování osobních údajů v rezervačním systému RezervujKurt.',
  alternates: { canonical: '/ochrana-osobnich-udaju' },
  robots: { index: false, follow: false },
};

const sectionClassName = 'space-y-2';

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl space-y-7 rounded-2xl border border-slate-200 bg-white p-5 leading-relaxed shadow-sm sm:p-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-slate-950">Ochrana osobních údajů</h1>
        <p className="text-sm text-slate-600">RezervujKurt je bezplatný systém pro rezervaci tenisových kurtů a zobrazení jejich obsazenosti.</p>
      </header>

      <section className={sectionClassName}>
        <h2 className="text-xl font-semibold">Jaké údaje používáme a proč</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li><strong>Účet:</strong> e-mail, identifikátor účtu, jméno pro rezervace, role a časové údaje. Slouží k přihlášení pomocí jednorázového odkazu a správě účtu.</li>
          <li><strong>Rezervace:</strong> vazba na účet, kurt, datum, čas, stav, případná poznámka a čas vytvoření či změny. Slouží k vytvoření, schválení, zobrazení a zrušení rezervace.</li>
          <li><strong>Provoz a bezpečnost:</strong> omezené auditní záznamy změn a technické záznamy chyb bez úmyslného ukládání přihlašovacích tokenů.</li>
        </ul>
        <p>Tyto údaje zpracováváme, protože jsou nezbytné pro poskytnutí rezervace a správu účtu (čl. 6 odst. 1 písm. b) GDPR), případně pro ochranu a provoz systému (oprávněný zájem podle čl. 6 odst. 1 písm. f) GDPR). Nevyžadujeme souhlas s GDPR a údaje nepoužíváme k marketingu.</p>
      </section>

      <section className={sectionClassName}>
        <h2 className="text-xl font-semibold">Přihlášení a provozní e-maily</h2>
        <p>První přihlášení e-mailem může současně vytvořit účet. Supabase odešle časově omezený přihlašovací odkaz a v prohlížeči uloží technicky nezbytnou relaci. Rezervační systém může přes službu Resend poslat správci informaci o nové rezervaci a uživateli informaci o jejím schválení. Nejde o marketingové zprávy.</p>
      </section>

      <section className={sectionClassName}>
        <h2 className="text-xl font-semibold">Co je veřejné</h2>
        <p>Veřejný kalendář zobrazuje pouze údaje potřebné k zobrazení obsazenosti: kurt, datum, čas a stav obsazení. Nezobrazuje e-mail, jméno, identifikátor uživatele ani poznámku. Přihlášení uživatelé pracují se svými rezervacemi; oprávněné role mají přístup k provozním údajům potřebným pro správu kurtů.</p>
      </section>

      <section className={sectionClassName}>
        <h2 className="text-xl font-semibold">Komu údaje předáváme</h2>
        <p>Pro přihlášení, databázi a serverové funkce používáme Supabase, pro provoz aplikace Vercel a pro rezervační e-maily Resend. Poskytovatelům předáváme pouze údaje potřebné pro danou službu. Údaje neprodáváme ani je neposkytujeme pro cílenou reklamu nebo marketingové profilování.</p>
      </section>

      <section className={sectionClassName}>
        <h2 className="text-xl font-semibold">Doba uchování</h2>
        <p>Historické údaje o termínu, kurtu a stavu rezervace uchováváme pro provozní evidenci a statistické vyhodnocování využití sportoviště. Pro údaje účtu, vazbu rezervace na uživatele, poznámky, provozní notifikace a bezpečnostní záznamy není stanovena automatická lhůta výmazu; jejich další uchování se posuzuje podle provozní potřeby, ochrany systému a právních povinností.</p>
      </section>

      <section className={sectionClassName}>
        <h2 className="text-xl font-semibold">Technické ukládání v prohlížeči</h2>
        <p>Aplikace ukládá do localStorage pouze technicky nezbytnou přihlašovací relaci včetně přístupového a obnovovacího tokenu. Nepoužívá analytické ani marketingové cookies.</p>
      </section>

      <section className={sectionClassName}>
        <h2 className="text-xl font-semibold">Vaše práva</h2>
        <p>Můžete požádat o přístup k údajům, opravu, výmaz při splnění podmínek, omezení zpracování nebo přenositelnost tam, kde se uplatní. Proti zpracování založenému na oprávněném zájmu můžete vznést námitku. Stížnost lze podat u Úřadu pro ochranu osobních údajů.</p>
      </section>

      <p className="border-t border-slate-200 pt-5 text-sm text-slate-600">Pro provoz rezervací platí také <Link href="/pravidla-rezervaci" className="text-court underline underline-offset-2">Pravidla rezervací</Link>.</p>
    </article>
  );
}
