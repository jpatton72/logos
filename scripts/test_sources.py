#!/usr/bin/env python3
"""Test which Bible data sources are accessible"""
import urllib.request

def fetch_url(url, timeout=15):
    req = urllib.request.Request(url, headers={'User-Agent': 'LogosBibleApp/1.0'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode('utf-8', errors='replace')

kjv = 'https://raw.githubusercontent.com/kojiro2/scrip/refs/heads/main/kjv.csv'
try:
    content = fetch_url(kjv)
    lines = content.count('\n')
    print(f'KJV: OK ({lines} lines) | first: {content.split(chr(10))[0][:80]}')
except Exception as e:
    print(f'KJV: FAIL - {e}')

greek_sources = [
    'https://raw.githubusercontent.com/jgoodyear/opensblgnt.github.io/master/sblgnt.csv',
    'https://raw.githubusercontent.com/etcbc/bhsa/master/data/tf/0.2.1/sblgnt.csv',
]
for url in greek_sources:
    try:
        content = fetch_url(url)
        lines = content.count('\n')
        first = content.split('\n')[0][:80]
        print(f'Greek ({url.split("/")[-1]}): OK ({lines} lines) | {first}')
        break
    except Exception as e:
        print(f'Greek ({url.split("/")[-1]}): FAIL - {str(e)[:80]}')

hebrew_sources = [
    'https://raw.githubusercontent.com/ETCBC/texts/main/oshb/oshb.txt',
    'https://raw.githubusercontent.com/ETCBC/texts/main/wlc/mr.txt',
]
for url in hebrew_sources:
    try:
        content = fetch_url(url)
        lines = content.count('\n')
        first = content.split('\n')[0][:80]
        print(f'Hebrew ({url.split("/")[-2]}/{url.split("/")[-1]}): OK ({lines} lines) | {first}')
    except Exception as e:
        print(f'Hebrew ({url.split("/")[-1]}): FAIL - {str(e)[:80]}')