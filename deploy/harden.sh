#!/usr/bin/env bash
# Защита сервера. Запускать от root:
#   bash /var/www/kvartiry/deploy/harden.sh            — шаг 1: защита от подбора пароля, автообновления, закрыть папку базы
#   bash /var/www/kvartiry/deploy/harden.sh --keys-only — шаг 2: вход только по ключу (пароль root больше не подойдёт)
# Шаг 2 сам откажется, если ключ ещё не добавлен — так нельзя случайно потерять доступ к серверу.
set -euo pipefail
APP=/var/www/kvartiry
export DEBIAN_FRONTEND=noninteractive

if [ "${1:-}" = "--keys-only" ]; then
  KEYS=/root/.ssh/authorized_keys
  if ! [ -s "$KEYS" ] || ! grep -qE '^(ssh-ed25519|ssh-rsa|ecdsa-)' "$KEYS"; then
    echo "Ключа нет в $KEYS — вход по паролю НЕ отключаю. Сначала добавьте ключ (инструкция в deploy/README.md)."
    exit 1
  fi
  mkdir -p /etc/ssh/sshd_config.d
  cat > /etc/ssh/sshd_config.d/10-keys-only.conf <<'EOF'
# kvartiry: вход только по ключу
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
EOF
  sshd -t
  systemctl reload ssh 2>/dev/null || systemctl reload sshd
  echo "Готово: вход по паролю отключён, вход по ключу работает."
  echo "НЕ закрывайте это окно, пока не проверите вход в новом окне: ssh root@$(hostname -I | awk '{print $1}')"
  echo "Если вдруг не входит — в этом окне верните пароль: rm /etc/ssh/sshd_config.d/10-keys-only.conf && systemctl reload ssh"
  exit 0
fi

echo "== 1/4 Защита от подбора пароля (fail2ban): 5 ошибок — IP блокируется на час =="
apt-get update -y
apt-get install -y fail2ban unattended-upgrades
cat > /etc/fail2ban/jail.d/kvartiry.local <<'EOF'
[sshd]
enabled = true
maxretry = 5
findtime = 10m
bantime = 1h
EOF
systemctl enable --now fail2ban
systemctl restart fail2ban

echo "== 2/4 Автоматические обновления безопасности системы =="
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
systemctl enable --now unattended-upgrades

echo "== 3/4 База (паспортные данные очереди) — только для сайта =="
chown -R kvartiry:kvartiry "$APP/data"
chmod 700 "$APP/data"
find "$APP/data" -type d -exec chmod 700 {} +
find "$APP/data" -type f -exec chmod 600 {} +
# Новые файлы базы и копий сайт тоже создаёт закрытыми
mkdir -p /etc/systemd/system/kvartiry.service.d
printf '[Service]\nUMask=0077\n' > /etc/systemd/system/kvartiry.service.d/private-files.conf
systemctl daemon-reload
systemctl restart kvartiry

echo "== 4/4 Брандмауэр: открыты только SSH и сайт =="
ufw allow OpenSSH >/dev/null
ufw allow 'Nginx Full' >/dev/null
ufw --force enable >/dev/null
ufw status | head -8

echo
echo "Готово. Шаг 2 (вход только по ключу) — когда добавите ключ: bash $APP/deploy/harden.sh --keys-only"
