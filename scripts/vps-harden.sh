#!/bin/bash
set -uo pipefail

echo "===== 1) SSH HARDENING ====="
DROPIN=/etc/sshd_config.d_placeholder
SSHD_DIR=/etc/ssh/sshd_config.d
sudo mkdir -p "$SSHD_DIR"
sudo tee "$SSHD_DIR/99-hardening.conf" >/dev/null <<'CONF'
# Durcissement SSH (ajoute au-dessus des reglages par defaut)
X11Forwarding no
AllowAgentForwarding no
MaxAuthTries 3
MaxSessions 4
LoginGraceTime 30
ClientAliveInterval 300
ClientAliveCountMax 2
AllowUsers ubuntu
CONF

echo "--- Validation sshd config ---"
if sudo sshd -t; then
  echo "sshd config OK -> reload"
  sudo systemctl reload ssh 2>/dev/null || sudo systemctl reload sshd 2>/dev/null
  echo "SSH reloaded."
else
  echo "ERREUR config sshd -> suppression du drop-in (pas de changement applique)"
  sudo rm -f "$SSHD_DIR/99-hardening.conf"
fi

echo "--- sshd effective (apres) ---"
sudo sshd -T 2>/dev/null | grep -Ei '^(x11forwarding|maxauthtries|allowusers|allowagentforwarding|clientaliveinterval)'

echo "===== 2) FAIL2BAN HARDENING ====="
sudo tee /etc/fail2ban/jail.local >/dev/null <<'CONF'
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 4
backend  = systemd

[sshd]
enabled  = true
maxretry = 4
bantime  = 2h
CONF
sudo systemctl restart fail2ban && echo "fail2ban redemarre."
sudo fail2ban-client status sshd 2>/dev/null | grep -E 'Total banned|Currently banned|maxretry' || true

echo "===== 3) CADDY SECURITY HEADERS / HSTS ====="
CADDY=/etc/caddy/Caddyfile
sudo cp "$CADDY" "${CADDY}.bak.$(date +%s)"
sudo tee "$CADDY" >/dev/null <<'CONF'
lepillaveur.fr, www.lepillaveur.fr {
	encode zstd gzip

	# HSTS applique meme aux reponses generees par Caddy (redirects, erreurs).
	# Les autres en-tetes de securite (CSP, X-Frame-Options, etc.) proviennent
	# de l'application Next.js et passent par le reverse_proxy.
	header {
		Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
		-Server
		-X-Powered-By
	}

	reverse_proxy 127.0.0.1:3000
}
CONF

echo "--- Validation Caddyfile ---"
if sudo caddy validate --config "$CADDY" --adapter caddyfile 2>/dev/null; then
  sudo systemctl reload caddy && echo "Caddy reloaded."
else
  echo "ERREUR Caddyfile -> restauration backup"
  LAST=$(ls -t ${CADDY}.bak.* 2>/dev/null | head -1)
  [ -n "$LAST" ] && sudo cp "$LAST" "$CADDY" && sudo systemctl reload caddy
fi

echo "===== 4) UNATTENDED-UPGRADES (auto security updates) ====="
sudo dpkg-reconfigure -f noninteractive unattended-upgrades 2>/dev/null || true
sudo systemctl is-enabled unattended-upgrades 2>/dev/null || true

echo "===== DONE ====="
