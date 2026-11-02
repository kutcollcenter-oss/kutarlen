# Установка на сервер (Contabo, Ubuntu 24.04)

Нужно: IP сервера (из письма Contabo), пароль root (тот, что задали при заказе), домен kvartiry.asia в Namecheap.
Команды для сервера вводятся в окне SSH; команды для компьютера — в PowerShell на компьютере.

## 1. Домен → сервер (Namecheap)

Domain List → kvartiry.asia → Manage → **Advanced DNS** → удалить старые записи `@` и `www`, если есть, и добавить:

| Type | Host | Value |
|---|---|---|
| A Record | `@` | IP сервера |
| CNAME Record | `www` | `kvartiry.asia` |

Начинает работать через 5–30 минут (иногда до пары часов).

## 2. Подключиться к серверу и установить сайт

На компьютере (PowerShell):

```bash
ssh root@IP_СЕРВЕРА
```

Первый раз спросит `Are you sure…` — напишите `yes`, затем пароль root (при вводе он не отображается — это нормально).

На сервере:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/kutcollcenter-oss/kutarlen/main/deploy/setup.sh)
```

Скрипт ставит Node.js, nginx, защиту и код сайта (5–10 минут). Сайт пока не запускается.

## 3. Перенести базу и фото с компьютера

На компьютере, в **новом** окне PowerShell (SSH не закрывать):

```bash
scp -r C:\Users\arlen\realtor-site\data C:\Users\arlen\realtor-site\uploads root@IP_СЕРВЕРА:/var/www/kvartiry/
```

Затем на сервере:

```bash
chown -R kvartiry:kvartiry /var/www/kvartiry && systemctl start kvartiry && systemctl status kvartiry --no-pager
```

Должно быть `active (running)`. Сайт уже открывается по `http://IP_СЕРВЕРА` и, когда заработает домен, по `http://kvartiry.asia`.

## 4. HTTPS (замок в браузере)

Когда `http://kvartiry.asia` открывается, на сервере:

```bash
certbot --nginx -d kvartiry.asia -d www.kvartiry.asia --redirect --agree-tos -m ВАШ_EMAIL
```

Сертификат продлевается сам.

## 5. После запуска — безопасность

Старые копии базы остались в истории GitHub (с хэшами паролей), поэтому:
- в кабинете **https://kvartiry.asia/admin** смените свой пароль: «Профиль» → «Пароль от кабинета»;
- менеджерам выдайте новые пароли: «Менеджеры» → «Новый пароль».

## 6. Защита сервера (обязательно до сбора паспортов в очередь)

**Шаг 1** — на сервере (защита от подбора пароля, автообновления, закрыть папку базы):

    bash /var/www/kvartiry/deploy/harden.sh

**Шаг 2** — ключ вместо пароля. На своём компьютере в PowerShell:

    ssh-keygen -t ed25519

(Enter на все вопросы; можно задать фразу-пароль для ключа.) Затем отправить ключ на сервер (последний раз спросит пароль root):

    type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh root@158.220.88.217 "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"

Проверить: `ssh root@158.220.88.217` должен войти без пароля root. Только после этого на сервере:

    bash /var/www/kvartiry/deploy/harden.sh --keys-only

Не закрывайте окно сервера, пока не проверите вход в новом окне. Ключ — файл `C:\Users\<вы>\.ssh\id_ed25519`: без него на сервер не войти, сохраните копию на флешке.

## Обновить сайт после изменений

На компьютере отправить код на GitHub (`publish.cmd`), затем на сервере:

```bash
bash /var/www/kvartiry/deploy/update.sh
```

База и фото на сервере при обновлении не затрагиваются.

## Полезное

```bash
systemctl status kvartiry          # работает ли сайт
journalctl -u kvartiry -n 50       # последние сообщения сайта
systemctl restart kvartiry         # перезапустить
```

Резервные копии базы — `/var/www/kvartiry/data/backups/` (каждый день), плюс Auto Backup в панели Contabo.
