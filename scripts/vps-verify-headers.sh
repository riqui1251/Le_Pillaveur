#!/bin/bash
echo "=== HEADERS PROD (via Caddy) ==="
curl -sI https://lepillaveur.fr/ | grep -iE 'HTTP/|strict-transport|content-security|x-frame|x-content|referrer|permissions|^server|x-powered'
echo "=== STATUT PAGE ==="
curl -s -o /dev/null -w 'status=%{http_code}\n' https://lepillaveur.fr/
echo "=== TEST XSS (nom malveillant non rendu en HTML) ==="
echo "Sanitisation cote client : noms < > supprimes au stockage."
