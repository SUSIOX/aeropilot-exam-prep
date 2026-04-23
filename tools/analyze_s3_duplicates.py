#!/usr/bin/env python3
"""
Analyzuje S3 bucket pro duplicity.
"""
import boto3

REGION = 'eu-central-1'
BUCKET = 'aeropilotexam'
PREFIX = 'questions/'

s3 = boto3.client('s3', region_name=REGION)

def analyze_s3():
    """Analyzuje S3 bucket a hledá duplicity."""
    print("Načítám seznam souborů z S3...")

    paginator = s3.get_paginator('list_objects_v2')
    files = []

    for page in paginator.paginate(Bucket=BUCKET, Prefix=PREFIX):
        for obj in page.get('Contents', []):
            key = obj['Key']
            filename = key[len(PREFIX):] if key.startswith(PREFIX) else key
            if filename:
                files.append({
                    'key': key,
                    'filename': filename,
                    'size': obj['Size'],
                    'modified': obj['LastModified'],
                    'etag': obj['ETag'].strip('"')
                })

    print(f"\nCelkem souborů v S3: {len(files)}")

    # 1. Duplicity podle názvu (case-insensitive)
    print("\n=== 1. DUPLICITY PODLE NÁZVU (case-insensitive) ===")
    name_map = {}
    for f in files:
        name_lower = f['filename'].lower()
        if name_lower in name_map:
            name_map[name_lower].append(f)
        else:
            name_map[name_lower] = [f]

    name_duplicates = {k: v for k, v in name_map.items() if len(v) > 1}
    if name_duplicates:
        for name, items in name_duplicates.items():
            print(f"\n  '{name}' - {len(items)}x:")
            for item in items:
                print(f"    - {item['key']} ({item['size']} bytes, {item['modified']})")
    else:
        print("  Žádné duplicity podle názvu.")

    # 2. Duplicity podle velikosti (potenciálně stejný obsah)
    print("\n=== 2. SOUBORY SE STEJNOU VELIKOSTÍ (potenciální duplicity) ===")
    size_map = {}
    for f in files:
        size = f['size']
        if size in size_map:
            size_map[size].append(f)
        else:
            size_map[size] = [f]

    size_duplicates = {k: v for k, v in size_map.items() if len(v) > 1}
    if size_duplicates:
        for size, items in sorted(size_duplicates.items(), key=lambda x: x[0], reverse=True):
            print(f"\n  Velikost {size} bytes - {len(items)} souborů:")
            for item in items:
                print(f"    - {item['filename']} ({item['modified']})")
    else:
        print("  Žádné soubory se stejnou velikostí.")

    # 3. Soubory podle data nahrání
    print("\n=== 3. SOUBORY PODLE DATA NAHRÁNÍ ===")
    from collections import defaultdict
    from datetime import datetime

    date_map = defaultdict(list)
    for f in files:
        date = f['modified'].strftime('%Y-%m-%d')
        date_map[date].append(f)

    for date in sorted(date_map.keys()):
        items = date_map[date]
        print(f"\n  {date}: {len(items)} souborů")
        # Zobrazit prvních 5 souborů
        for item in items[:5]:
            print(f"    - {item['filename']}")
        if len(items) > 5:
            print(f"    ... a dalších {len(items) - 5} souborů")

    # 4. Soubory podle prefixu
    print("\n=== 4. SOUBORY PODLE TYPU/PREFIXU ===")
    prefix_counts = defaultdict(int)
    for f in files:
        name = f['filename'].lower()
        if name.startswith('pfa-'):
            prefix_counts['PFA-xxx (UCL)'] += 1
        elif name.startswith('aerodnamika_'):
            prefix_counts['aerodnamika_xxx (lokální)'] += 1
        elif name.startswith('ias') or name.startswith('tas') or name.startswith('llswc'):
            prefix_counts['Navigace/ostatní'] += 1
        else:
            prefix_counts['Ostatní'] += 1

    for prefix, count in sorted(prefix_counts.items(), key=lambda x: x[1], reverse=True):
        print(f"  {prefix}: {count} souborů")

    # 5. Potenciální problémy
    print("\n=== 5. POTENCIÁLNÍ PROBLÉMY ===")

    # Nalezení souborů, které mohou být duplicitní mezi PFA a aerodnamika
    pfa_files = {f['filename']: f for f in files if f['filename'].lower().startswith('pfa-')}
    aerodnamika_files = [f for f in files if f['filename'].lower().startswith('aerodnamika_')]

    print(f"  PFA soubory: {len(pfa_files)}")
    print(f"  aerodnamika soubory: {len(aerodnamika_files)}")

    # Kontrola shody velikosti mezi PFA a aerodnamika
    pfa_sizes = {f['size']: f for f in files if f['filename'].lower().startswith('pfa-')}
    matching_sizes = []
    for f in aerodnamika_files:
        if f['size'] in pfa_sizes:
            matching_sizes.append((f, pfa_sizes[f['size']]))

    if matching_sizes:
        print(f"\n  ⚠️  NALEZENO {len(matching_sizes)} párů se STEJNOU VELIKOSTÍ (PFA vs aerodnamika):")
        for aero, pfa in matching_sizes:
            print(f"    - {aero['filename']} == {pfa['filename']} ({aero['size']} bytes)")
    else:
        print("\n  ✅ Žádné shody velikosti mezi PFA a aerodnamika soubory.")

    print("\n" + "="*60)
    print("ANALÝZA DOKONČENA")
    print("="*60)

if __name__ == "__main__":
    analyze_s3()
