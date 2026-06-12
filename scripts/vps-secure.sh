#!/bin/bash
set -e

echo "=== SSH : connexion par cle uniquement ==="
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config || true
sed -i 's/^#*PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config || true
sed -i 's/^#*PubkeyAuthentication.*/PubkeyAuthentication yes/' /etc/ssh/sshd_config || true
# Neutraliser le reglage cloud-init qui reactive le mot de passe
if [ -f /etc/ssh/sshd_config.d/50-cloud-init.conf ]; then
  sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config.d/50-cloud-init.conf || true
fi
printf 'PasswordAuthentication no\nPermitRootLogin no\n' > /etc/ssh/sshd_config.d/99-hardening.conf
systemctl restart ssh 2>/dev/null || systemctl restart sshd

echo "=== Pare-feu UFW (entree) ==="
ufw --force reset >/dev/null
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "=== fail2ban ==="
systemctl enable --now fail2ban >/dev/null 2>&1 || true

echo "=== Verification ==="
ufw status verbose
sshd -T 2>/dev/null | grep -E 'passwordauthentication|permitrootlogin|pubkeyauthentication' || true
echo DONE_SEC
