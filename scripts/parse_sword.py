#!/usr/bin/env python3
"""Parse Crosswire SWORD module files and extract verse text."""
import zipfile
import struct
import os
import zlib
import re

def parse_bzv(bzv_path):
    """Parse SWORD verse link table (bzv) file.
    Format: For each verse, 8 bytes (uint32 offset, uint16 verse_index, uint16 chapter_num).
    """
    entries = []
    if not os.path.exists(bzv_path):
        return entries
    with open(bzv_path, 'rb') as f:
        while True:
            data = f.read(8)
            if len(data) < 8:
                break
            offset, verse_idx, chapter = struct.unpack('<IHH', data)
            if offset == 0 and verse_idx == 0 and chapter == 0:
                break
            entries.append((offset, verse_idx, chapter))
    return entries

def try_decompress(data, name):
    """Try various decompression methods."""
    results = []
    
    # Method 1: raw zlib
    try:
        dec = zlib.decompress(data)
        text = dec.decode('utf-8', errors='replace')
        results.append(f"[{name}] zlib OK: {len(dec)} bytes")
        results.append(f"  FIRST: {text[:300]}")
        # Check if it has verse markers
        if '\\' in text[:500]:
            markers = list(set(re.findall(r'\\([a-z]+)', text[:2000])))[:15]
            results.append(f"  MARKERS: {markers}")
        return dec, text, results
    except Exception as e:
        results.append(f"[{name}] zlib failed: {e}")
    
    # Method 2: zlib with -15 window size (raw deflate)
    try:
        dec = zlib.decompress(data, -15)
        text = dec.decode('utf-8', errors='replace')
        results.append(f"[{name}] zlib(-15) OK: {len(dec)} bytes")
        results.append(f"  FIRST: {text[:300]}")
        return dec, text, results
    except Exception as e:
        results.append(f"[{name}] zlib(-15) failed: {e}")
    
    # Method 3: check for SWORD compression markers
    text = data.decode('latin-1', errors='replace')
    markers = re.findall(r'\\([a-z]+)', text[:2000])
    results.append(f"[{name}] raw: {len(data)} bytes")
    results.append(f"  MARKERS: {list(set(markers))[:15]}")
    results.append(f"  FIRST: {text[:300]}")
    return None, text, results

def extract_bzz_text(bzz_path, bzv_path, label=""):
    """Extract text from SWORD compressed text (bzz) using bzv offsets."""
    results = []
    results.append(f"\n=== {label} ===")
    
    if not os.path.exists(bzz_path):
        results.append(f"  File not found: {bzz_path}")
        return results
    
    with open(bzz_path, 'rb') as f:
        raw = f.read()
    results.append(f"  bzz size: {len(raw)} bytes, first 16 bytes: {raw[:16].hex()}")
    
    dec_raw, text, decomp_results = try_decompress(raw, label)
    results.extend(decomp_results)
    
    if dec_raw:
        dec_text = dec_raw.decode('utf-8', errors='replace')
        
        if os.path.exists(bzv_path):
            entries = parse_bzv(bzv_path)
            results.append(f"  BZV entries: {len(entries)}, first 10: {entries[:10]}")
            
            for i, (offset, verse_idx, chapter) in enumerate(entries[:5]):
                if offset < len(dec_text):
                    end = dec_text.find('\x00', offset)
                    if end == -1:
                        end = min(offset + 200, len(dec_text))
                    verse_text = dec_text[offset:end].strip()
                    results.append(f"    [{i}] verse_idx={verse_idx} ch={chapter} offset={offset}: {verse_text[:100]}")
        else:
            results.append(f"  No bzv. Raw text preview:")
            results.append(f"  {dec_text[:500]}")
    
    return results

def main():
    base = '/tmp/sword_modules'
    
    tests = [
        ("KJV OT", "kjv_ext", "kjv", "ot"),
        ("KJV NT", "kjv_ext", "kjv", "nt"),
        ("TR NT",  "tr_ext",  "tr",  "nt"),
    ]
    
    all_results = []
    for label, subdir, module, sec in tests:
        bzz = f"{base}/{subdir}/modules/texts/ztext/{module}/{sec}.bzz"
        bzv = f"{base}/{subdir}/modules/texts/ztext/{module}/{sec}.bzv"
        all_results.extend(extract_bzz_text(bzz, bzv, label))
    
    # Also show conf files
    for conf_path, name in [
        ("/tmp/sword_modules/kjv_ext/mods.d/kjv.conf", "KJV.conf"),
        ("/tmp/sword_modules/tr_ext/mods.d/tr.conf", "TR.conf"),
    ]:
        try:
            with open(conf_path) as f:
                all_results.append(f"\n=== {name} ===")
                all_results.append(f.read())
        except:
            pass
    
    for r in all_results:
        print(r)

if __name__ == '__main__':
    main()
