import csv
import json
import re
from collections import defaultdict

csv_path = 'Datasets/CMS/QDD_PTD_RQ2603_P01_V10_DQT2601_20260708.csv'
out_json_path = 'public/medicare_part_d_spending.json'

data_by_generic = defaultdict(lambda: {'claims': 0, 'spending': 0.0, 'benes': 0, 'brands': set(), 'uses': set()})
data_by_brand = defaultdict(lambda: {'claims': 0, 'spending': 0.0, 'benes': 0, 'generic': '', 'uses': set()})

def clean_num(val):
    if not val:
        return 0.0
    val = val.replace(',', '').replace('$', '').strip()
    try:
        return float(val)
    except:
        return 0.0

with open(csv_path, mode='r', encoding='utf-8', errors='replace') as f:
    reader = csv.DictReader(f)
    for r in reader:
        # We only take Mftr_Name == 'Overall' to avoid double counting across individual manufacturers!
        if r.get('Mftr_Name') != 'Overall':
            continue
            
        brnd = (r.get('Brnd_Name') or '').strip()
        gnrc = (r.get('Gnrc_Name') or '').strip()
        clms = clean_num(r.get('Tot_Clms'))
        spnd = clean_num(r.get('Tot_Spndng'))
        bens = clean_num(r.get('Tot_Benes'))
        use = (r.get('Drug_Uses') or '').strip()
        
        g_key = gnrc.lower()
        b_key = brnd.lower()
        
        if g_key:
            data_by_generic[g_key]['claims'] += clms
            data_by_generic[g_key]['spending'] += spnd
            data_by_generic[g_key]['benes'] += bens
            if brnd: data_by_generic[g_key]['brands'].add(brnd)
            if use and use != 'Drug uses not available': data_by_generic[g_key]['uses'].add(use)
            
        if b_key:
            data_by_brand[b_key]['claims'] += clms
            data_by_brand[b_key]['spending'] += spnd
            data_by_brand[b_key]['benes'] += bens
            if gnrc: data_by_brand[b_key]['generic'] = gnrc
            if use and use != 'Drug uses not available': data_by_brand[b_key]['uses'].add(use)

print(f'Aggregated generics: {len(data_by_generic)}, brands: {len(data_by_brand)}')

# Top 10 by spending
top_spnd = sorted(data_by_generic.items(), key=lambda x: x[1]['spending'], reverse=True)[:10]
for g, vals in top_spnd:
    print(f"{g} | Claims: {vals['claims']:,.0f} | Spending: ${vals['spending']:,.2f} | Brands: {list(vals['brands'])[:3]}")

# Export serialized JSON map for frontend lookup
json_data = {
    'by_generic': {k: {
        'claims': int(v['claims']),
        'spending': round(v['spending'], 2),
        'benes': int(v['benes']),
        'brands': list(v['brands'])[:5],
        'uses': list(v['uses'])[:2]
    } for k, v in data_by_generic.items()},
    'by_brand': {k: {
        'claims': int(v['claims']),
        'spending': round(v['spending'], 2),
        'benes': int(v['benes']),
        'generic': v['generic'],
        'uses': list(v['uses'])[:2]
    } for k, v in data_by_brand.items()}
}

with open(out_json_path, 'w', encoding='utf-8') as f:
    json.dump(json_data, f, ensure_ascii=False)

import os
print(f'Wrote {out_json_path} ({os.path.getsize(out_json_path)/1024:.1f} KB)')
