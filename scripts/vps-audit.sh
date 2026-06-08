#!/bin/bash
echo "===== SUDO TEST ====="
sudo -n true 2>/dev/null && echo "PASSWORDLESS_SUDO=yes" || echo "PASSWORDLESS_SUDO=no"
echo "===== UPTIME/KERNEL ====="
uname -a; uptime
echo "===== PENDING UPDATES ====="
sudo -n apt-get -s upgrade 2>/dev/null | grep -c "^Inst" || echo "n/a"
echo "===== SECURITY UPDATES ====="
sudo -n apt-get -s upgrade 2>/dev/null | grep -i security | grep -c "^Inst" || echo "n/a"
echo "===== UNATTENDED-UPGRADES ====="
dpkg -l 2>/dev/null | grep -q unattended-upgrades && echo "installed" || echo "NOT installed"
echo "===== SSH CONFIG ====="
sudo -n sshd -T 2>/dev/null | grep -Ei '^(permitrootlogin|passwordauthentication|pubkeyauthentication|port|permitemptypasswords|x11forwarding|maxauthtries|allowusers|challengeresponseauthentication|kbdinteractiveauthentication)' || echo "sshd -T unavailable"
echo "===== FIREWALL UFW ====="
sudo -n ufw status verbose 2>/dev/null || echo "ufw n/a"
echo "===== NFTABLES/IPTABLES ====="
sudo -n iptables -S 2>/dev/null | head -40 || echo "iptables n/a"
echo "===== FAIL2BAN ====="
systemctl is-active fail2ban 2>/dev/null || echo "fail2ban not active"
echo "===== LISTENING PORTS ====="
sudo -n ss -tulpn 2>/dev/null | grep LISTEN
echo "===== DOCKER ====="
docker version --format '{{.Server.Version}}' 2>/dev/null || echo "docker n/a"
docker ps --format '{{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Status}}' 2>/dev/null
echo "===== DOCKER SWARM SERVICES ====="
docker service ls 2>/dev/null || echo "no swarm"
echo "===== USERS WITH SHELL ====="
grep -E '/(bash|sh|zsh)$' /etc/passwd
echo "===== SUDOERS ====="
sudo -n cat /etc/sudoers 2>/dev/null | grep -vE '^#|^$'
sudo -n ls /etc/sudoers.d/ 2>/dev/null
echo "===== AUTHORIZED KEYS ====="
wc -l ~/.ssh/authorized_keys 2>/dev/null
echo "===== ROOT AUTHORIZED KEYS ====="
sudo -n wc -l /root/.ssh/authorized_keys 2>/dev/null || echo "none/no access"
echo "===== EGRESS FILTER SCRIPT ====="
ls -la /usr/local/bin/egress-filter.sh 2>/dev/null && sudo -n cat /usr/local/bin/egress-filter.sh 2>/dev/null
echo "===== WEB EXPOSURE (local curl) ====="
curl -sI http://127.0.0.1:80/api/health 2>/dev/null | head -20
echo "===== AUTH LOG TAIL (failed) ====="
sudo -n grep -i "failed password" /var/log/auth.log 2>/dev/null | tail -5 | sed 's/from \([0-9.]*\).*/from \1/' || echo "no auth.log access"
echo "===== DONE ====="
