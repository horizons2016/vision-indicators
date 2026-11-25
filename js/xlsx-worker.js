// عامل معزول لقراءة ملفات Excel المرفوعة في صفحة الإدارة.
// يعمل في سياق منفصل عن الصفحة: أي خلل في ملف ملغّم يبقى داخل العامل ولا يصل إلى بيانات الصفحة.
// يعيد لكل ورقة: أسماء الأعمدة (h) وصفوف القيم (rows) — بيانات بسيطة فقط، بلا كائنات.
self.importScripts("../lib/xlsx.full.min.js");
self.onmessage = e => {
  try {
    const wb = XLSX.read(new Uint8Array(e.data), { type: "array", cellFormula: false, cellHTML: false, bookVBA: false });
    const sheets = {};
    for (const name of wb.SheetNames) {
      const objs = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: null, raw: true });
      const h = [];
      objs.forEach(o => Object.keys(o).forEach(k => { if (!h.includes(k)) h.push(k); }));
      const ok = v => v === null || ["string", "number", "boolean"].includes(typeof v) ? v : (v instanceof Date ? v.toISOString() : String(v));
      sheets[name] = { h: h.map(String), rows: objs.map(o => h.map(k => Object.prototype.hasOwnProperty.call(o, k) ? ok(o[k]) : undefined)) };
    }
    self.postMessage({ ok: true, names: wb.SheetNames.map(String), sheets });
  } catch (err) {
    self.postMessage({ ok: false, error: String(err && err.message || err) });
  }
};
