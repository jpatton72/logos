import sqlite3
conn = sqlite3.connect('/home/jean-galt/.local/share/logos/logos.db')
for t in ['verses','books','translations']:
    c = conn.execute(f'SELECT COUNT(*) FROM {t}')
    print(f'{t}: {c.fetchone()[0]}')
print()
for row in conn.execute('''
    SELECT tr.abbreviation, tr.name, COUNT(v.id) as verses 
    FROM translations tr LEFT JOIN verses v ON v.translation_id = tr.id
    GROUP BY tr.id
'''):
    print(f'  {row[0]} ({row[1]}): {row[2]} verses')
conn.close()
