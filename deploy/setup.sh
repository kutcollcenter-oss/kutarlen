#!/usr/bin/env bash
# Первая установка сайта на чистый сервер Ubuntu 24.04. Запускать от root:
#   bash <(curl -fsSL https://raw.githubusercontent.com/kutcollcenter-oss/kutarlen/main/deploy/setup.sh)
# Сайт после этой команды ещё не запускается: сначала переносим базу и фото (deploy/README.md, шаг 3).
set -euo pipefail

REPO=https://github.com/kutcollcenter-oss/kutarlen.git
APP=/var/www/kvartiry

echo "== 1/6 Обновление системы и программы =="
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
apt-get install -y curl git nginx ufw certbot python3-certbot-nginx

echo "== 2/6 Node.js 22 LTS =="
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
node -v

echo "== 3/6 Пользователь и код сайта =="
id -u kvartiry >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin kvartiry
git config --global --add safe.directory "$APP"
if [ -d "$APP/.git" ]; then git -C "$APP" pull --ff-only; else git clone "$REPO" "$APP"; fi
mkdir -p "$APP/data" "$APP/uploads"
cd "$APP"
npm ci --omit=dev
chown -R kvartiry:kvartiry "$APP"

echo "== 4/6 Автозапуск сайта =="
cp "$APP/deploy/kvartiry.service" /etc/systemd/system/kvartiry.service
systemctl daemon-reload
systemctl enable kvartiry

echo "== 5/6 nginx =="
cp "$APP/deploy/nginx.conf" /etc/nginx/sites-available/kvartiry
ln -sf /etc/nginx/sites-available/kvartiry /etc/nginx/sites-enabled/kvartiry
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

echo "== 6/6 Защита: открыты только SSH и веб =="
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

echo
if [ -f "$APP/data/db.json" ]; then
  systemctl restart kvartiry
  echo "Готово: сайт запущен."
else
  echo "Готово. Сайт ещё НЕ запущен: перенесите базу и фото (deploy/README.md, шаг 3), затем:"
  echo "  chown -R kvartiry:kvartiry $APP && systemctl start kvartiry"
fi
