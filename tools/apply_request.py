#!/usr/bin/env python3
"""اعتماد طلب تحديث من تعليق في GitHub Issues.

الأوامر (في تعليق على طلب مفتوح، من صاحب صلاحية في المستودع):
  /اعتماد                         ← يعتمد القيم المقترحة في الطلب (طلبات البنك الدولي)
  /اعتماد U-31 2026 3.0           ← يضيف أو يصحح قراءة: الرمز السنة القيمة [الترتيب]
يمكن كتابة عدة أسطر في تعليق واحد. المصدر يؤخذ من الطلب نفسه.
يكتب data/dataset.json ويطبع ملخصاً بصيغة JSON لخطوة سير العمل التالية.
"""
import json, os, re, sys, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CMD = re.compile(r'^\s*/(?:اعتماد|approve)\b(.*)$', re.M)
ARGS = re.compile(r'^\s*([UuOo]-\d+(?:-\d+)?)\s+(\d{4})\s+([-+]?[\d.,٠-٩٫]+)\s*%?(?:\s+([\d٠-٩]+))?\s*$')
AR = str.maketrans('٠١٢٣٤٥٦٧٨٩٫', '0123456789.')


def parse_marker(body):
    m = re.search(r'<!-- ov2040-request (\{.*?\}) -->', body or '', re.S)
    return json.loads(m.group(1)) if m else None


def parse_commands(comment, req):
    """يعيد قائمة قراءات {code, year, v, r} أو يرفع ValueError برسالة عربية."""
    lines = [m.group(1).strip() for m in CMD.finditer(comment or '')]
    if not lines: raise ValueError('لا يوجد أمر /اعتماد في التعليق.')
    out = []
    for ln in lines:
        if not ln:
            props = (req or {}).get('proposals') or []
            if not props: raise ValueError('هذا الطلب لا يحتوي قيمة مقترحة؛ اكتب: /اعتماد الرمز السنة القيمة')
            out += [dict(p, r=None) for p in props]; continue
        m = ARGS.match(ln.translate(AR))
        if not m: raise ValueError(f'لم أفهم السطر: «/اعتماد {ln}». الصيغة: /اعتماد الرمز السنة القيمة [الترتيب]')
        code, y, v, r = m.group(1).upper(), int(m.group(2)), float(m.group(3).replace(',', '')), m.group(4)
        out.append({'code': code, 'year': y, 'v': v, 'r': int(r) if r else None})
    return out


def apply(ds, items, req, issue_no, who):
    ind = {i['code']: i for i in ds['indicators']}
    allowed = set((req or {}).get('codes') or [])
    src = ((req or {}).get('src') or 'اعتماد يدوي').strip()
    done = []
    for it in items:
        if it['code'] not in ind: raise ValueError(f"الرمز {it['code']} غير موجود في بيانات التطبيق.")
        if allowed and it['code'] not in allowed and (req or {}).get('kind') != 'due':
            raise ValueError(f"الرمز {it['code']} لا يخص هذا الطلب (المؤشرات: {'، '.join(sorted(allowed))}).")
        if not 1990 <= it['year'] <= datetime.date.today().year + 1: raise ValueError(f"السنة {it['year']} غير منطقية.")
        idx = next((k for k, r in enumerate(ds['readings']) if r[0] == it['code'] and r[1] == it['year']), None)
        old = ds['readings'][idx] if idx is not None else None
        rank = it['r'] if it['r'] is not None else (old[3] if old and old[2] == it['v'] else None)
        note = f'اعتُمدت عبر طلب التحديث #{issue_no} ({who}، {datetime.date.today().isoformat()}).'
        row = [it['code'], it['year'], it['v'], rank, src, 'فعلية', None, 'عالية', note]
        if idx is None: ds['readings'].append(row)
        else: ds['readings'][idx] = row
        done.append({'code': it['code'], 'name': ind[it['code']]['name'], 'year': it['year'],
                     'old': None if old is None else old[2], 'new': it['v'], 'unit': ind[it['code']].get('unit')})
    ds['readings'].sort(key=lambda r: (str(r[0]), r[1]))
    ds.setdefault('meta', {})['built'] = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%MZ')
    return done


def main():
    ev = json.load(open(os.environ['GITHUB_EVENT_PATH'], encoding='utf-8'))
    issue, comment = ev['issue'], ev['comment']
    req = parse_marker(issue.get('body'))
    out_path = os.environ.get('RESULT_PATH', '/tmp/apply_result.json')
    try:
        items = parse_commands(comment['body'], req)
        p = os.path.join(ROOT, 'data', 'dataset.json')
        ds = json.load(open(p, encoding='utf-8'))
        done = apply(ds, items, req, issue['number'], comment['user']['login'])
        json.dump(ds, open(p, 'w', encoding='utf-8'), ensure_ascii=False)
        res = {'ok': True, 'done': done}
    except ValueError as e:
        res = {'ok': False, 'error': str(e)}
    json.dump(res, open(out_path, 'w', encoding='utf-8'), ensure_ascii=False)
    print(json.dumps(res, ensure_ascii=False))


if __name__ == '__main__':
    main()
