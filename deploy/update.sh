#!/usr/bin/env bash
# Обновить сайт на сервере после изменений в GitHub. Запускать от root:
#   bash /var/www/kvartiry/deploy/update.sh
# База (data/) и фото (uploads/) на сервере не затрагиваются — их нет в GitHub.
set -euo pipefail
APP=/var/www/kvartiry
cd "$APP"
git pull --ff-only
npm ci --omit=dev
chown -R kvartiry:kvartiry "$APP"
systemctl restart kvartiry
sleep 2
systemctl is-active --quiet kvartiry && echo "Сайт обновлён и работает." || { echo "Сайт не запустился, последние строки журнала:"; journalctl -u kvartiry -n 30 --no-pager; exit 1; }
