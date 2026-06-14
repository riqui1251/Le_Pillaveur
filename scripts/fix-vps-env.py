#!/usr/bin/env python3
from pathlib import Path

p = Path('/opt/le-pillaveur/.env')
lines = p.read_text().splitlines()
vars_map = {
    'SITE_URL': 'https://lepillaveur.fr',
    'NEXT_PUBLIC_APP_URL': 'https://lepillaveur.fr',
    'EMAIL_FROM': 'Le Pillaveur <noreply@lepillaveur.fr>',
    'NODE_ENV': 'production',
    'DATABASE_URL': 'file:/app/prisma/prod.db',
}
out = []
seen = set()
for line in lines:
    if '=' not in line or line.strip().startswith('#'):
        out.append(line)
        continue
    key = line.split('=', 1)[0].strip()
    if key in vars_map:
        out.append(f'{key}={vars_map[key]}')
        seen.add(key)
    elif key == 'RESEND_API_KEY':
        val = line.split('=', 1)[1].strip().strip('"')
        out.append(f'RESEND_API_KEY={val}')
        seen.add(key)
    else:
        out.append(line)
for k, v in vars_map.items():
    if k not in seen:
        out.append(f'{k}={v}')
p.write_text('\n'.join(out) + '\n')
print('fixed')
