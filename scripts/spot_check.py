import sqlite3
conn = sqlite3.connect('/home/jean-galt/.local/share/logos/logos.db')

# Spot-check Hebrew verses
hebrew_checks = [
    ("Gen", 1, 1, 4, "Hebrew Genesis 1:1"),
    ("Ps", 23, 1, 4, "Hebrew Psalms 23:1"),
    ("Isa", 40, 1, 4, "Hebrew Isaiah 40:1"),
]

print("Hebrew spot-check:")
for abbrev, ch, vn, tid, label in hebrew_checks:
    row = conn.execute(
        "SELECT text FROM verses WHERE book_id = (SELECT id FROM books WHERE abbreviation = ?) AND chapter = ? AND verse_num = ? AND translation_id = ?",
        (abbrev, ch, vn, tid)
    ).fetchone()
    if row:
        print(f"  {label}: {row[0][:80]}...")
    else:
        print(f"  {label}: MISSING")

print()
print("Full verse counts by translation:")
for row in conn.execute("""
    SELECT tr.abbreviation, tr.name, tr.language,
           COUNT(DISTINCT b.id) as books,
           COUNT(v.id) as verses
    FROM translations tr
    LEFT JOIN verses v ON v.translation_id = tr.id
    JOIN books b ON v.book_id = b.id
    GROUP BY tr.id
    ORDER BY tr.id
"""):
    print(f"  {row[0]} ({row[2]}): {row[3]} books, {row[4]} verses")

conn.close()
