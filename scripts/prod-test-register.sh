#!/bin/bash
set -euo pipefail
cat > /tmp/reg.json <<'JSON'
{"email":"testvps5@example.com","password":"testpass123","displayName":"TestVPS"}
JSON
echo "=== REQUEST ==="
cat /tmp/reg.json
echo
echo "=== RESPONSE ==="
curl -s -X POST http://127.0.0.1:3000/api/auth/register \
  -H 'Content-Type: application/json' \
  --data-binary @/tmp/reg.json
echo
echo "=== LOGS ==="
docker logs le-pillaveur --tail 8 2>&1
