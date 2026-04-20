#!/usr/bin/env python3
"""Find the CORRECT offset/size pairs in bzs for each book."""
import struct, zlib, re

def find_all_books(bzz_path, bzs_path, label):
    with open(bzz_path, 'rb') as f:
        bzz_data = f.read()
    with open(bzs_path, 'rb') as f:
        bzs_data = f.read()
    
    num_entries = len(bzs_data) // 8
    print(f"\n=== {label} ===")
    print(f"bzz={len(bzz_data)}, entries={num_entries}")
    
    # Try ALL offset/size combinations and find which decompress
    results = []
    for i in range(num_entries):
        off, size, extra = struct.unpack_from('<IHH', bzs_data, i * 8)
        if off + size > len(bzz_data):
            continue
        try:
            compressed = bzz_data[off:off+size]
            text = zlib.decompress(compressed)
            text_str = text.decode('utf-8', errors='replace')
            
            # Check for OSIS content (book div)
            if '<div canonical="true" osisID=' in text_str and 'type="book"' in text_str:
                book_match = re.search(r'osisID="([A-Za-z1-9]+)"', text_str)
                if book_match:
                    book_name = book_match.group(1)
                    # Filter out non-bible entries
                    if book_name not in ['KJV', 'module', 'SWORD']:
                        ch_count = len(re.findall(r'<chapter[^>]+>', text_str))
                        results.append((i, off, size, extra, len(text), book_name, ch_count, text_str))
        except:
            pass
    
    print(f"Books found: {len(results)}")
    for r in results:
        print(f"  [{r[0]:2d}] {r[5]:10s} off={r[1]:8d} sz={r[2]:7d} uncomp={r[4]:8d} chaps={r[6]}")
    
    return results

kjv_ot = find_all_books(
    '/tmp/sword_modules/kjv_ext/modules/texts/ztext/kjv/ot.bzz',
    '/tmp/sword_modules/kjv_ext/modules/texts/ztext/kjv/ot.bzs',
    "KJV OT")
print(f"\nTotal KJV OT books: {len(kjv_ot)}")

kjv_nt = find_all_books(
    '/tmp/sword_modules/kjv_ext/modules/texts/ztext/kjv/nt.bzz',
    '/tmp/sword_modules/kjv_ext/modules/texts/ztext/kjv/nt.bzs',
    "KJV NT")
print(f"\nTotal KJV NT books: {len(kjv_nt)}")

tr_nt = find_all_books(
    '/tmp/sword_modules/tr_ext/modules/texts/ztext/tr/nt.bzz',
    '/tmp/sword_modules/tr_ext/modules/texts/ztext/tr/nt.bzs',
    "TR Greek NT")
print(f"\nTotal TR NT books: {len(tr_nt)}")

# Now analyze one KJV OT book in detail - what are the verse boundaries?
print("\n=== KJV OT VERSE ANALYSIS (Josh) ===")
if kjv_ot:
    r = kjv_ot[0]
    text = r[7]
    
    # Strip OSIS tags
    def strip_tags(t):
        t = re.sub(r'<verse\s[^>]*>', '', t)
        t = re.sub(r'</verse>', '', t)
        t = re.sub(r'<lb[^>]*/>', ' ', t)
        t = re.sub(r'<note[^>]*>.*?</note>', '', t)
        t = re.sub(r'<title[^>]*>.*?</title>', '', t)
        t = re.sub(r'<div[^>]*>', '', t)
        t = re.sub(r'</div>', '', t)
        t = re.sub(r'<chapter[^>]*/>', ' [CHAPTER] ', t)
        t = re.sub(r'<w[^>]*>(.*?)</w>', r'\1', t)
        t = re.sub(r'<[^>]+>', '', t)
        t = re.sub(r'\s+', ' ', t)
        return t.strip()
    
    plain = strip_tags(text)
    print(f"Plain text length: {len(plain)}")
    print(f"First 1000 chars:\n{plain[:1000]}")
    
    # Count chapters
    chapters = re.findall(r'<chapter[^>]+osisID="[^"]+"[^>]*/>', text)
    print(f"\nChapters: {len(chapters)}")
    for ch in chapters[:3]:
        print(f"  {ch}")
    
    # Try verse splitting
    # The text has word-level markup. Verses don't have explicit markers.
    # But maybe there's a pattern like word.word
    # Let's look at the raw word patterns
    words = re.findall(r'<w[^>]*>([^<]+)</w>', text)
    print(f"\nFirst 50 words: {' '.join(words[:50])}")
    print(f"\nTotal words: {len(words)}")
    
    # Try splitting by chapter
    chapter_texts = re.split(r'<chapter[^>]+osisID="([^"]+)"[^>]*/>', text)
    # chapter_texts has alternating: [empty or header, chapter_name, chapter_content, ...]
    # Actually the split gives us [before_first_chapter, ch1_id, ch1_content, ch2_id, ch2_content, ...]
    
    print(f"\nChapter splits: {len(chapter_texts)} segments")
    for i in range(0, min(len(chapter_texts), 8), 2):
        if i+1 < len(chapter_texts):
            print(f"  Chapter: {chapter_texts[i+1][:30]}")
            print(f"  Content length: {len(chapter_texts[i+2])}")
            words = re.findall(r'<w[^>]*>([^<]+)</w>', chapter_texts[i+2])
            print(f"  Words: {len(words)}")
            plain_ch = strip_tags(chapter_texts[i+2])
            print(f"  Plain: {plain_ch[:200]}")
            print()

# Similarly analyze TR (Greek) - check verse markers
print("\n=== TR GREEK VERSE ANALYSIS (Rom) ===")
for item in tr_nt:
    if item[5] == 'Rom':
        r = item
        text = r[7]
        print(f"Text length: {len(text)}")
        print(f"First 2000:\n{text[:2000]}")
        
        # Check for verse milestone markers
        verse_milestones = re.findall(r'<verse[^>]+osisID="Rom\.[^"]+"[^>]*/>', text)
        print(f"\nVerse milestones: {len(verse_milestones)}")
        for v in verse_milestones[:10]:
            print(f"  {v}")
        
        # Check for verse start/end tags
        verse_starts = re.findall(r'<verse[^>]+sID[^>]*>', text)
        print(f"\nVerse sID tags: {len(verse_starts)}")
        for v in verse_starts[:5]:
            print(f"  {v}")
        
        # Try alternative verse patterns
        verses_in_ch1 = re.findall(r'osisID="Rom\.1\.(\d+)"', text)
        print(f"\nVerses in Rom 1: {len(verses_in_ch1)}")
        if verses_in_ch1:
            print(f"  First 5: {verses_in_ch1[:5]}")
        break