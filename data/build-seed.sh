#!/bin/bash
# Regenerates data/lighting-catalogue.js from v_lighting_catalogue (same endpoint the engine reads).
# Usage: bash data/build-seed.sh   (needs network; anon key read from ../sonor-db.js)
set -e
cd "$(dirname "$0")"
K=$(grep -o "eyJ[A-Za-z0-9_.-]*" ../sonor-db.js | head -1)
curl -s "https://ysmvklstkzodlocttspy.supabase.co/rest/v1/v_lighting_catalogue?select=*&order=grp,category,sort_order,name" \
  -H "apikey: $K" -H "Authorization: Bearer $K" > /tmp/_lighting_seed.json
python3 - <<'PY'
import json, datetime
rows = json.load(open('/tmp/_lighting_seed.json'))
d = datetime.date.today().isoformat()
out = "/* Sonor Lighting Design — Tier-3 offline seed (GENERATED %s)\n   window.__LIGHTING_SEED__ — snapshot of v_lighting_catalogue (lighting_items ⟕ wq_product_skus).\n   Regenerate: bash data/build-seed.sh. NO trade pricing beyond the WQ join columns.\n*/\n(function () {\n  window.__LIGHTING_SEED__ = { generated: '%s', items:\n" % (d, d)
out += json.dumps(rows, indent=1, ensure_ascii=False)
out += "\n  };\n})();\n"
open('lighting-catalogue.js','w').write(out)
print('seed regenerated:', len(rows), 'items')
PY
