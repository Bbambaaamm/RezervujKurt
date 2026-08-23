package cz.michal.settleupimport;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Typeface;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.text.NumberFormat;
import java.util.Calendar;
import java.util.GregorianCalendar;
import java.util.Locale;
import java.util.TimeZone;

public class MainActivity extends Activity {
    private static final String SETTLE_UP_PACKAGE = "cz.destil.settleup";

    private static final class Tx {
        final int year, month, day;
        final String purpose;
        final double amount;
        Tx(int year, int month, int day, String purpose, double amount) {
            this.year = year; this.month = month; this.day = day;
            this.purpose = purpose; this.amount = amount;
        }
    }

    private final Tx[] txs = new Tx[] {
        new Tx(2026,8,18,"Coop",272.90),
        new Tx(2026,8,18,"Bergrestaurant Gletschergrotte",3568.35),
        new Tx(2026,8,19,"Matterhorn Gotthard Bahn",887.01),
        new Tx(2026,8,19,"Zbag Schluhmatte Bille",2165.04),
        new Tx(2026,8,19,"Coop",701.86),
        new Tx(2026,8,19,"Coop",724.11),
        new Tx(2026,8,19,"Zermatt Souvenirs",541.94),
        new Tx(2026,8,19,"Saas-FeeSaastal",774.25),
        new Tx(2026,8,19,"Matterhorn Parking",387.16),
        new Tx(2026,8,19,"Metro Bar",1296.80),
        new Tx(2026,8,20,"Spielboden",2666.80),
        new Tx(2026,8,20,"Coop",635.56),
        new Tx(2026,8,20,"Pubwise 3 We",623.35),
        new Tx(2026,8,21,"La Casera",2131.38),
        new Tx(2026,8,21,"bls",647.17),
        new Tx(2026,8,21,"Coop",611.15),
        new Tx(2026,8,21,"BP",390.41),
        new Tx(2026,8,21,"Saas-FeeSaastal",778.56),
        new Tx(2026,8,21,"Parcheggio Verbania",121.18),
        new Tx(2026,8,21,"Eni",2422.74),
        new Tx(2026,8,21,"Distributore A3grill S",288.25),
        new Tx(2026,8,21,"Schloss Huenegg",517.04),
        new Tx(2026,8,22,"Nomad",227.58),
        new Tx(2026,8,22,"bls",801.39),
        new Tx(2026,8,22,"Coop",1119.51),
        new Tx(2026,8,22,"Coop",520.80),
        new Tx(2026,8,22,"Spar",95.70),
        new Tx(2026,8,22,"Saas-FeeSaastal",387.68),
        new Tx(2026,8,22,"Grandhotel Giessbach",387.74),
        new Tx(2026,8,23,"Mattelift",77.54),
        new Tx(2026,8,23,"Coop",414.80),
        new Tx(2026,8,23,"Migros",38.77),
        new Tx(2026,8,23,"Cailler",77.54),
        new Tx(2026,8,23,"Cailler",1398.15),
        new Tx(2026,8,23,"Cailler",432.89),
        new Tx(2026,8,23,"Belwag Ag Bern",330.81),
        new Tx(2026,8,23,"Berner Münster",310.13)
    };

    private int index = 0;
    private TextView progress;
    private TextView title;
    private TextView details;
    private Button prev;
    private Button next;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        buildUi();
        render();
    }

    private void buildUi() {
        ScrollView scroll = new ScrollView(this);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(24), dp(24), dp(24), dp(24));
        scroll.addView(root);

        TextView header = new TextView(this);
        header.setText("Settle Up Import – Švýcarsko 2026");
        header.setTextSize(24);
        header.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        root.addView(header);

        TextView info = new TextView(this);
        info.setText("37 společných plateb · 29 774,04 Kč\nHerohero a Robo portfolio jsou vynechané.\n\nPřed prvním uložením v Settle Up zkontroluj: zaplatil Michal, pro Michal + Tomáš, 50/50.");
        info.setTextSize(16);
        info.setPadding(0, dp(12), 0, dp(24));
        root.addView(info);

        progress = new TextView(this);
        progress.setTextSize(15);
        root.addView(progress);

        title = new TextView(this);
        title.setTextSize(28);
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        title.setPadding(0, dp(16), 0, dp(8));
        root.addView(title);

        details = new TextView(this);
        details.setTextSize(20);
        details.setPadding(0, 0, 0, dp(24));
        root.addView(details);

        Button open = new Button(this);
        open.setText("OTEVŘÍT JAKO NOVÝ VÝDAJ V SETTLE UP");
        open.setAllCaps(false);
        open.setTextSize(16);
        open.setOnClickListener(v -> openCurrent());
        root.addView(open, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(60)));

        LinearLayout nav = new LinearLayout(this);
        nav.setOrientation(LinearLayout.HORIZONTAL);
        nav.setGravity(Gravity.CENTER);
        nav.setPadding(0, dp(16), 0, 0);
        root.addView(nav);

        prev = new Button(this);
        prev.setText("← Předchozí");
        prev.setAllCaps(false);
        prev.setOnClickListener(v -> { if (index > 0) { index--; render(); } });
        nav.addView(prev, new LinearLayout.LayoutParams(0, dp(52), 1));

        next = new Button(this);
        next.setText("Další →");
        next.setAllCaps(false);
        next.setOnClickListener(v -> { if (index < txs.length - 1) { index++; render(); } });
        LinearLayout.LayoutParams np = new LinearLayout.LayoutParams(0, dp(52), 1);
        np.setMarginStart(dp(8));
        nav.addView(next, np);

        setContentView(scroll);
    }

    private void render() {
        Tx tx = txs[index];
        NumberFormat nf = NumberFormat.getNumberInstance(new Locale("cs", "CZ"));
        nf.setMinimumFractionDigits(2);
        nf.setMaximumFractionDigits(2);
        progress.setText("Položka " + (index + 1) + " z " + txs.length);
        title.setText(tx.purpose);
        details.setText(String.format(Locale.getDefault(), "%02d. %02d. %04d\n%s Kč", tx.day, tx.month, tx.year, nf.format(tx.amount)));
        prev.setEnabled(index > 0);
        next.setEnabled(index < txs.length - 1);
    }

    private void openCurrent() {
        Tx tx = txs[index];
        Intent intent = getPackageManager().getLaunchIntentForPackage(SETTLE_UP_PACKAGE);
        if (intent == null) {
            Toast.makeText(this, "Settle Up není nainstalované nebo ho Android nevidí.", Toast.LENGTH_LONG).show();
            return;
        }
        intent.setAction("SHORTCUT_ADD_EXPENSE");
        intent.putExtra("AMOUNT", tx.amount);
        intent.putExtra("CURRENCY_CODE", "CZK");
        intent.putExtra("PURPOSE", tx.purpose);
        intent.putExtra("DATE_TIME", dateMillis(tx));
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
        try {
            startActivity(intent);
        } catch (Exception e) {
            Toast.makeText(this, "Settle Up se nepodařilo otevřít jako nový výdaj: " + e.getClass().getSimpleName(), Toast.LENGTH_LONG).show();
        }
    }

    private long dateMillis(Tx tx) {
        Calendar c = new GregorianCalendar(TimeZone.getTimeZone("Europe/Prague"));
        c.clear();
        c.set(tx.year, tx.month - 1, tx.day, 12, 0, 0);
        return c.getTimeInMillis();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
