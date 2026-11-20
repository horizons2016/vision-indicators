// فصل البيانات الداخلية عن الملف العام وتشفيرها — يطابق التشفير داخل index.html حرفياً.
// الاستخدام (الرمز يُمرَّر في متغير بيئة ولا يُكتب في أي ملف):
//   OVD_ANA_KEY='رمز التحليل' node tools/seal.mjs split full.json   → يكتب data/dataset.json (عام) + data/internal.enc (مشفّر)
//   OVD_ANA_KEY='رمز التحليل' node tools/seal.mjs join  full.json   → يعيد بناء الملف الكامل للتحرير (لا تضعه في المستودع)
//   node tools/seal.mjs check                                        → يفشل إذا وُجدت حقول داخلية في data/dataset.json
import { readFileSync, writeFileSync, existsSync } from "node:fs";
const { subtle } = globalThis.crypto, getRandomValues = a => globalThis.crypto.getRandomValues(a);
export const ANA_FIELDS = ["owner","risk","review","approval","factors","supporting","challenges","explain","initiatives","stage_note"];
const ITER = 310000, PUB = "data/dataset.json", ENC = "data/internal.enc";
const b64 = u8 => Buffer.from(u8).toString("base64"), ub64 = s => new Uint8Array(Buffer.from(s, "base64"));
async function key(pass, salt){
  const base = await subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveKey"]);
  return subtle.deriveKey({name:"PBKDF2", salt, iterations:ITER, hash:"SHA-256"}, base, {name:"AES-GCM", length:256}, true, ["encrypt","decrypt"]);
}
export function split(ds){
  const fields = {};
  const indicators = ds.indicators.map(i => { const o = {...i}, f = {};
    ANA_FIELDS.forEach(k => { if (k in o){ if (o[k] != null && o[k] !== "") f[k] = o[k]; delete o[k]; } });
    if (Object.keys(f).length) fields[i.code] = f; return o; });
  return { pub: {...ds, indicators, notes: []}, internal: {v:1, fields, notes: ds.notes || []} };
}
export function join(pub, internal){
  return {...pub, indicators: pub.indicators.map(i => ({...i, ...(internal.fields[i.code] || {})})), notes: internal.notes || []};
}
const leaks = ds => ds.indicators.flatMap(i => ANA_FIELDS.filter(k => i[k] != null && i[k] !== "").map(k => `${i.code}.${k}`)).concat((ds.notes || []).length ? ["notes"] : []);
const [cmd, file] = process.argv.slice(2), pass = process.env.OVD_ANA_KEY;
if (cmd === "check"){
  const l = leaks(JSON.parse(readFileSync(PUB, "utf8")));
  if (l.length){ console.error("✗ حقول داخلية ظاهرة في الملف العام: " + l.slice(0, 12).join("، ") + (l.length > 12 ? " …" : "")); process.exit(1); }
  console.log("✓ الملف العام لا يحتوي حقولاً داخلية"); process.exit(0);
}
if (!pass || !file || !["split","join"].includes(cmd)){ console.error("الاستخدام: OVD_ANA_KEY=... node tools/seal.mjs split|join full.json  |  node tools/seal.mjs check"); process.exit(2); }
if (cmd === "split"){
  const full = JSON.parse(readFileSync(file, "utf8")), {pub, internal} = split(full);
  // نُبقي الملح نفسه حتى تبقى الأجهزة المفتوحة صالحة ما دام الرمز لم يتغير
  let salt = getRandomValues(new Uint8Array(16));
  if (existsSync(ENC)){ const old = JSON.parse(readFileSync(ENC, "utf8")); const s = ub64(old.salt), k = await key(pass, s);
    try { await subtle.decrypt({name:"AES-GCM", iv:ub64(old.iv)}, k, ub64(old.ct)); salt = s; } catch { console.warn("! الرمز لا يفتح الملف المشفّر الحالي: سيُنشأ ملح جديد (رمز جديد)."); } }
  const k = await key(pass, salt), iv = getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await subtle.encrypt({name:"AES-GCM", iv}, k, new TextEncoder().encode(JSON.stringify(internal))));
  writeFileSync(PUB, JSON.stringify(pub)); writeFileSync(ENC, JSON.stringify({v:1, kdf:"PBKDF2-SHA256", iter:ITER, salt:b64(salt), iv:b64(iv), ct:b64(ct)}));
  console.log(`✓ ${PUB}: ${pub.indicators.length} مؤشراً بلا حقول داخلية · ${ENC}: ${Object.keys(internal.fields).length} مؤشراً + ${internal.notes.length} ملاحظة (مشفّرة)`);
} else {
  const env = JSON.parse(readFileSync(ENC, "utf8")), k = await key(pass, ub64(env.salt));
  const internal = JSON.parse(new TextDecoder().decode(await subtle.decrypt({name:"AES-GCM", iv:ub64(env.iv)}, k, ub64(env.ct))));
  writeFileSync(file, JSON.stringify(join(JSON.parse(readFileSync(PUB, "utf8")), internal)));
  console.log(`✓ كُتب الملف الكامل إلى ${file} — لا تضعه في المستودع`);
}
