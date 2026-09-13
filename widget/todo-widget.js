// todo — home-screen widget for Scriptable (https://scriptable.app, free).
// 1. Install Scriptable. 2. New script, paste this file, name it "todo".
// 3. Add a Scriptable widget to the home screen, choose the "todo" script.
// The phone must reach your todo server (Tailscale on). Tap the widget to open the app.

const SERVER = "https://your-machine.your-tailnet.ts.net:8790"; // your todo serve URL

// tokyo-night; change these to match your theme
const BG = new Color("#1a1b26"), FG = new Color("#c0caf5"), MUTED = new Color("#a9b1d6"), FAINT = new Color("#565f89"), ACCENT = new Color("#7aa2f7"), OK = new Color("#9ece6a");

const size = config.widgetFamily || "medium";
const w = new ListWidget();
w.backgroundColor = BG;
w.url = SERVER;
w.setPadding(14, 14, 12, 14);
w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);

let data = null, error = "";
try {
  const req = new Request(SERVER + "/api/summary");
  req.timeoutInterval = 10;
  data = await req.loadJSON();
} catch (e) { error = String(e); }

const mono = (s) => Font.regularMonospacedSystemFont(s);
const bold = (s) => Font.boldMonospacedSystemFont(s);

// title row: "todo" + open count
const head = w.addStack();
head.centerAlignContent();
const t1 = head.addText("to"); t1.font = bold(13); t1.textColor = FG;
const t2 = head.addText("do"); t2.font = bold(13); t2.textColor = ACCENT;
head.addSpacer();
if (data) {
  const c = head.addText(data.open + " open"); c.font = mono(11); c.textColor = FAINT;
}
w.addSpacer(8);

if (!data) {
  const e = w.addText("no server"); e.font = mono(12); e.textColor = FAINT;
  const d = w.addText(error.slice(0, 80)); d.font = mono(9); d.textColor = FAINT;
} else {
  const rows = size === "small" ? 3 : size === "large" ? 10 : 4;
  const lines = data.top.slice(0, rows);
  if (!lines.length) {
    const z = w.addText("nothing open"); z.font = mono(12); z.textColor = MUTED;
  }
  for (const it of lines) {
    const r = w.addStack();
    r.centerAlignContent();
    const box = r.addText("□ "); box.font = mono(12); box.textColor = it.raw ? FAINT : MUTED;
    const txt = r.addText(it.head); txt.font = it.raw ? mono(12) : bold(12); txt.textColor = it.raw ? MUTED : FG; txt.lineLimit = 1;
    w.addSpacer(3);
  }
  w.addSpacer();
  const foot = w.addStack();
  foot.centerAlignContent();
  const parts = [];
  if (data.streak) parts.push(data.streak + "d streak");
  if (data.doneToday) parts.push(data.doneToday + " done today");
  if (data.someday) parts.push(data.someday + " someday");
  const f = foot.addText(parts.join(" · ") || "quiet day"); f.font = mono(10); f.textColor = data.streak ? OK : FAINT;
}

Script.setWidget(w);
Script.complete();
if (config.runsInApp) w.presentMedium();
