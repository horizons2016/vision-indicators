(function(){
  const $ = s => document.querySelector(s);
  const log = (t, c) => { const d = document.createElement("div"); d.className = c || "info"; d.textContent = t; $("#log").appendChild(d); };
  const today = new Date();
  let kind = "quarterly", DS = null, ENGINE = null;

  // افتراضياً: آخر ربع مكتمل، وآخر سنة مكتملة
  const lastQ = (() => { const q = Math.floor(today.getMonth() / 3); return q === 0 ? { y: today.getFullYear() - 1, q: 4 } : { y: today.getFullYear(), q }; })();
  function fillYears(){
    const sel = $("#year"), keep = sel.value; sel.innerHTML = "";
    for (let y = today.getFullYear(); y >= 2020; y--) sel.add(new Option(String(y), y));
    sel.value = keep || (kind === "annual" ? today.getFullYear() - 1 : lastQ.y);
  }
  function setKind(k){
    kind = k;
    document.querySelectorAll(".card").forEach(c => c.setAttribute("aria-checked", c.dataset.kind === k));
    $("#qWrap").hidden = $("#qOpts").hidden = k !== "quarterly";
    $("#year").value = k === "annual" ? today.getFullYear() - 1 : lastQ.y;
  }
  document.querySelectorAll(".card").forEach(c => { c.onclick = () => setKind(c.dataset.kind); c.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setKind(c.dataset.kind); } }; });
  $("#baseMode").onchange = () => { $("#baseFile").hidden = $("#baseMode").value !== "file"; };
  fillYears(); $("#quarter").value = lastQ.q; setKind("quarterly");

  // محرك الحساب: ملف js/engine.js نفسه الذي تستخدمه اللوحة (مصدر واحد للحسابات)
  async function loadEngine(){
    if (ENGINE) return ENGINE;
    if (!window.OVEngine) throw new Error("تعذر تحميل محرك الحساب (js/engine.js)");
    return ENGINE = window.OVEngine;
  }
  async function loadData(){
    if (DS) return DS;
    return DS = await (await fetch("data/dataset.json", { cache: "no-store" })).json();
  }
  // نسخة البيانات كما كانت في تاريخ معيّن، من سجل GitHub (المستودع عام)
  function repo(){
    const h = location.hostname;
    if (h.endsWith(".github.io")) return { o: h.split(".")[0], r: location.pathname.split("/").filter(Boolean)[0] || h };
    return { o: "ov2040", r: "vision-indicators" };
  }
  async function snapshotAt(date){
    const { o, r } = repo();
    const api = `https://api.github.com/repos/${o}/${r}/commits?path=data/dataset.json&per_page=1&until=${date.toISOString()}`;
    const res = await fetch(api); if (!res.ok) throw new Error("GitHub " + res.status);
    const list = await res.json(); if (!list.length) return null;
    const sha = list[0].sha, when = new Date(list[0].commit.committer.date);
    const ds = await (await fetch(`https://raw.githubusercontent.com/${o}/${r}/${sha}/data/dataset.json`)).json();
    return { ds, label: when.getDate() + "/" + (when.getMonth() + 1) + "/" + when.getFullYear() };
  }
  const readFile = f => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => { try { ok(JSON.parse(r.result)); } catch (e) { no(e); } }; r.onerror = no; r.readAsText(f); });

  // حفظ بدون مجلدات فارغة داخل الملف (تعيقه أحياناً OneDrive وSharePoint)
  async function save(pres, name){
    const buf = await pres.write({ outputType: "arraybuffer" });
    const src = await JSZip.loadAsync(buf), out = new JSZip();
    const files = []; src.forEach((p, f) => { if (!f.dir) files.push(p); });
    for (const p of files) out.file(p, await src.file(p).async("uint8array"), { createFolders: false });
    const blob = await out.generateAsync({ type: "blob", compression: "DEFLATE", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }

  $("#go").onclick = async () => {
    $("#log").innerHTML = ""; $("#go").disabled = true;
    try {
      const [E, ds] = await Promise.all([loadEngine(), loadData()]);
      log("البيانات: تحديث " + String((ds.meta && ds.meta.built) || "").slice(0, 10));
      const Y = +$("#year").value, Q = +$("#quarter").value;
      const opts = { kind, year: Y, quarter: Q, set: $("#set").value, font: $("#font").value, today };
      if (kind === "quarterly") {
        const mode = $("#baseMode").value;
        if (mode === "file") {
          const f = $("#baseFile").files[0];
          if (!f) throw new Error("اختر ملف dataset.json السابق أولاً");
          opts.baseline = await readFile(f); opts.baselineLabel = f.name;
          log("المقارنة مع الملف: " + f.name);
        } else if (mode === "auto") {
          const start = new Date(Y, (Q - 1) * 3, 1);
          try {
            const snap = await snapshotAt(start);
            if (snap) { opts.baseline = snap.ds; opts.baselineLabel = "نسخة " + snap.label; log("المقارنة مع نسخة البيانات بتاريخ " + snap.label); }
            else log("لا توجد نسخة بيانات قبل بداية الربع في السجل؛ ستصدر النشرة دون مقارنة (الإصدار الأول).");
          } catch (e) { log("تعذر الوصول إلى سجل GitHub (" + e.message + ")؛ ستصدر النشرة دون مقارنة.", "err"); }
        }
      }
      const pres = OVReports.build(PptxGenJS, E, ds, opts);
      const name = kind === "annual" ? `لمحة عن الرؤية ${Y}.pptx` : `نبض الرؤية ${Y}-Q${Q}.pptx`;
      await save(pres, name);
      log("تم إنشاء الملف: " + name, "ok");
    } catch (e) { console.error(e); log("خطأ: " + e.message, "err"); }
    $("#go").disabled = false;
  };
})();
