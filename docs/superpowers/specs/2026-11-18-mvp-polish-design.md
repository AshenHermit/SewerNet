# MVP — доводка: Windows desktop, CI и prod-compose

Дата: 2026-11-18. Статус: дизайн целиком одобрен пользователем 2026-11-18; подготовка implementation plans.

## 1. Назначение и согласованные решения

Завершить три незакрытых пункта `ROADMAP.md / MVP — доводка`: `apps/desktop`, GitHub Actions с проверками и сборками, production docker-compose. Доставка включает работоспособность текущего Matrix-клиента, а не только создание конфигурационных файлов.

Пользователь выбрал:
- Tauri, пока только Windows;
- общий web-интерфейс и платформенные адаптеры, без отдельного desktop-фронтенда;
- Rust-side secure storage, OS credential store через семейство keyring;
- `sewernet://` deep links для автообновления и tray; loopback `http://127.0.0.1:4201/oidc/callback` для OIDC callback;
- Tauri Bundler для установщиков и Tauri Updater Plugin для обновлений.

Дополнительные решения, одобренные пользователем 2026-11-18:
- Windows x64 (`x86_64-pc-windows-msvc`), Windows 10/11 с WebView2;
- NSIS `.exe`, установка для текущего пользователя;
- callback OIDC — loopback `http://127.0.0.1:4201/oidc/callback` (/dev+loopback port, не production-only); `sewernet://oidc/callback` сохраняется как легаси deep-link для уже выданных сессий;
- закрытие окна скрывает его в tray; меню «Открыть», «Проверить обновления», «Выход»;
- автоматическая проверка обновлений при запуске; установка только после подтверждения;
- stable-релизы и manifest updater в публичных GitHub Releases `AshenHermit/SewerNet`;
- Caddy только для HTTP host-routing `subdomain.${COMMON_DOMAIN}` к сервисам SewerNet; сертификаты, внешний HTTPS и входящий routing обеспечивает существующий корневой Nginx пользователя;
- landing и web на отдельных subdomains, landing — static export;
- backend по умолчанию доступен только внутри compose, не опубликован как открытый Matrix/OAuth-прокси;
- desktop OIDC приёмка на `unredacted.org` через loopback redirect; password fallback при несовместимости MAS не закрывает этот пункт;
- стандартное Matrix encrypted attachments v2: шифрование отправляемых файлов и расшифровка полученных в общей web/desktop-реализации.

## 2. Цели, не-цели и ограничения

### Цели

1. Windows-приложение устанавливается, открывает общий UI, выполняет OIDC и парольный fallback, sync, E2EE, историю, отправку текста/файлов и authenticated media.
2. Desktop не сохраняет access/refresh токены, OIDC claims и PKCE verifier в localStorage или plaintext-файлы. Перезапуск восстанавливает аккаунт из Rust-side secure storage.
3. Callback обрабатывается в уже открытом приложении и после холодного запуска. Повторные, просроченные и посторонние callback не выполняют обмен кода.
4. Проверки PR не требуют production-секретов. Windows-сборка проверяет Rust и реальную упаковку. Публикация релиза требует зелёных проверок и подписанных updater artifacts.
5. Compose поднимает landing, web, stateless backend и HTTP reverse proxy из воспроизводимых образов; документация описывает подключение к существующему TLS-terminating Nginx, subdomains, приватный backend и smoke checks.

### Не-цели

macOS/Linux/ARM64/mobile; уведомления, autostart, device verification/key backup UI; собственный updater/bundler; перенос Matrix SDK в Rust; миграция всех browser credentials в desktop из внешнего браузера; Authenticode-сертификат и покупка сертификатов; автоматический деплой на чужой сервер; сервер Matrix/MAS внутри compose.

### Анти-цели

Дублирование web-экранов; бесшумная потеря rotated refresh token; plaintext fallback при ошибке keyring; внешние страницы с доступом к Tauri IPC; updater без проверки подписи; выдача прод-прокси без ограничения доступа; отметки ROADMAP о готовности без проверок.

### Существующие ограничения

- Nx 24, npm 11.6.1 workspaces, React 19, Vite 8, Matrix SDK 41.9, rust-crypto WASM.
- `apps/web` содержит только логику/данные: оформление и новые визуальные части исключительно через proxy-компоненты `libs/ui`; EN/RU через Lingui.
- Matrix-запросы идут напрямую к homeserver, не через NestJS.
- `accounts.ts` и zustand auth persist сейчас синхронные; bootstrap импортирует auth-store до React render. Понадобится явная асинхронная инициализация и контроль hydration.
- Matrix SDK OIDC использует `window.sessionStorage` с префиксом `mx_oidc_`; `sewernet:oidc_pending` хранит дополнительный контекст. Публичный SDK API не принимает custom state store.
- Media сейчас используют service worker `public/sw.js`; поддержка SW в packaged WebView не считается доказанной.
- Windows generic credential blob ограничен 2560 байтами; один JSON всех аккаунтов/PKCE может не поместиться. Размер и регистр имён записей тоже нужно учитывать.
- Backend принимает URL homeserver и OAuth endpoints от клиента; текущая реализация не обеспечивает безопасную публичную экспозицию произвольных upstream URL.
- Реальная default branch на GitHub — `master`, вопреки описанию `main` в AGENTS. CI использует фактическую default branch; переименование ветки не входит в задачу.
- Landing сейчас выполняет `next build`, но `output: 'export'` не задан, отдельного `typecheck` target нет.
- `CREDENTIALS.md` и `.env` игнорируются Git; не включать их в Docker context, CI artifacts и документацию.

## 3. Рассмотренные подходы

### A. Общий web-интерфейс + платформенные адаптеры — выбран пользователем

Tauri упаковывает существующий web UI. Узкие адаптеры разделяют хранение аккаунтов, OIDC launch/callback, media и lifecycle. Rust реализует нативные обязанности. Минимальная область рефакторинга, единые Matrix hooks/экраны; нужно аккуратно изменить bootstrap и persistence.

### B. Отдельный desktop-фронтенд с общими библиотеками

Отдельная entry point/приложение упрощает изоляцию нативного запуска, но требует выделения экранов/авторизации из `apps/web`. Риск дублирования и расхождения UI. Не выбран.

Stronghold/JS persisted store не используются как замена выбранному OS credential store. Для упаковки и обновлений используются штатные Tauri Bundler и Tauri Updater Plugin, не самописный механизм.

Production-варианты: Next standalone server сохраняет динамические возможности, но они сейчас не нужны; пользователь одобрил static export landing. Для внутреннего host-routing используется Caddy вместо второго набора Nginx-конфигов; пользователь уточнил, что TLS уже обеспечивает корневой Nginx, поэтому compose не выпускает сертификаты и не управляет внешним HTTPS. Backend сохраняется отдельным сервисом, даже когда публичные web/landing его не используют.

## 4. Структура и платформенный контракт

- `apps/desktop`: npm workspace с Nx target-ами, Tauri CLI и `src-tauri` (Cargo manifest/lockfile, main/lib, storage, callback/lifecycle, config, capabilities, icons). Не генерировать второй React app.
- `apps/web/src/platform`: небольшие TypeScript контракты, browser реализация и лениво загружаемая desktop реализация через Tauri IPC.
- Desktop frontend build использует те же исходники Vite, но отдельный режим/выходной каталог от обычного `apps/web/dist`, чтобы Nx cache и параллельные сборки не путались.
- Detection нативного runtime через официальную Tauri API; пользовательские localStorage flags не дают нативных полномочий.
- Bootstrap сначала выбирает платформу, инициализирует хранилище и callback listener, затем hydrates auth-store и рендерит UI. Не читать browser credentials автоматически до выбора платформы.
- Семантика storage: async `initialize`, `upsertAccount`, `removeAccount`, `setActiveAccount`, `clear`; синхронные чтения только из уже загруженного memory snapshot. Изменение snapshot/auth UI считается успешным после успешной durable записи. Writes сериализованы; никаких fire-and-forget сохранений.
- Убрать дублирующие записи через OIDC/password + zustand persist. Один явный путь сохранения аккаунта, один путь очистки. Browser adapter сохраняет прежние ключи и пользовательское поведение.
- Login, tokenRefreshFunction, смена активного аккаунта и logout ожидают запись. При ошибке записи rotated токенов остановить affected сессию, показать ошибку сохранения; не возобновлять аккаунт из старого durable refresh token без предупреждения. Уточнение исполнителя при планировании: durable in-flight barrier записывается до refresh-запроса; commit новых credentials снимает barrier. Crash/неопределённый результат ротации оставляет предупреждение и требует нового входа, а не replay старого токена.
- Ошибка initial keyring read не равна «нет аккаунтов»: UI показывает доступную для повторной попытки ошибку загрузки. Logout при ошибке удаления останавливает живой клиент, сообщает, что локальные секреты не удалены; не объявляет очистку успешной.

## 5. Rust secure storage

Использовать поддерживаемый keyring backend Windows Credential Manager. Конкретная версия crate — решение исполнителя после проверки API: актуальная экосистема предлагает `keyring-core` + `windows-native-keyring-store`, старый `keyring` имеет другой интерфейс. Backend фиксирован как Windows-native, без mock/file fallback в production.

### Формат и надёжность

- Раздельные версионированные logical records: аккаунт, pending OIDC, account index/active id. Все секретные payload — только credential blobs.
- Credential target names включают фиксированный namespace продукта и хэш точного userId/идентификатора записи: case-insensitive Windows names не должны смешивать разные Matrix IDs. Не перечислять/читать чужие credentials.
- Long payload разбивается Rust-слоем на bounded binary chunks не более 2048 байт; использовать byte secret API, не UTF-16 password API для JSON.
- Для каждой записи новые chunks пишутся под новым generation id. Последней заменяется небольшая root descriptor (schema version, generation, chunk count, length, integrity hash). Читатель никогда не смешивает поколения. Старые chunks удаляются после commit; ошибки post-commit GC не превращают успешную запись в неуспешную.
- Ограничить logical record (предлагаемый предел 256 KiB) и chunk count, проверить длину/hash/schema до deserialization. Некорректная/неполная запись — явная ошибка, не пустая сессия.
- Использовать local-machine persistence для текущего пользователя, не roaming Enterprise. Сериализовать операции с одним store/record, включая read/write/delete; keyring блокирующие операции не выполняются на UI thread.
- Account index не становится активным до commit аккаунта. При сбое до index commit возможна неактивная orphan запись, но не ссылка на частично записанный активный аккаунт. Cleanup затрагивает только собственный namespace.
- Удаление пишет tombstone/исключает активный аккаунт, удаляет все его поколения и pending flow; повтор удаления идемпотентен. Ошибки удаления отображаются пользователю.
- Предыдущие desktop-localStorage secrets, если обнаружены после развития прототипа, импортируются один раз в keyring; browser keys удаляются только после успешной записи. При ошибке миграции bootstrap блокирует auth, не читает их как fallback. Чужой browser profile не импортируется.
- Токены не логируются, Rust structs секретов не используют открытый `Debug`. Ошибки IPC не включают raw JSON/URL callback. Очистка временных буферов best-effort, без обещаний удаления всех JS копий из памяти.

### Граница безопасности

OS store защищает persisted секреты, но не скомпрометированный процесс текущего Windows-пользователя. Matrix SDK требует access/refresh токены в JS памяти; они проходят IPC только в доверенный main WebView. SDK IndexedDB timeline/crypto остаются в отдельном WebView profile; перенос Matrix E2EE database в keyring не входит в эту задачу.

IPC commands узкие: собственные account операции, pending OIDC операции, updater/lifecycle. Никакого generic keyring read по произвольному service/target, filesystem, shell command или URL-driven IPC. Capabilities ограничены локальным main window; remote origins не получают доступ. Внешние web-ссылки открываются браузером, а не навигацией main WebView.

## 6. Desktop OIDC и deep links

1. Register native OIDC client с точным `http://127.0.0.1:4201/oidc/callback` (loopback, браузерно-нативный origin); `applicationType: native` независимо от HTTPS-схемы WebView. Легаси `sewernet://oidc/callback` принимается только для уже сохранённых deep-link сессий, не для новой регистрации. ClientId cache учитывает issuer и точный redirect URI, не содержит секретов. ClientUri — валидный публичный HTTPS URL проекта, не `tauri://`.
2. SDK создаёт authorization URL и PKCE/state в sessionStorage. Прочитать только связанный с этим state `mx_oidc_` record и собственный pending контекст, записать их через Rust secure storage **до** открытия системного браузера. Не зеркалировать всё sessionStorage.
3. Pending record содержит redirectUri, state, issuer, SDK serialized state, контекст и время создания; один текущий flow, срок 15 минут. Новый flow заменяет прежний. При ошибке сохранения/открытия браузера flow не считается запущенным.
4. Single-instance plugin регистрируется первым, с deep-link feature. Deep-link scheme статически задан в config; installer регистрирует обработчик. Для dev registration требуется явный dev режим; не перезаписывать установленный handler бесшумно.
5. На старте установить listener до чтения initial URLs, выполнять дедупликацию. Callback допускает только точный scheme/host/path, без userinfo, port и fragment; bounded query, ровно один state и либо code, либо OAuth error. Не принимать произвольный URL для навигации или token endpoint.
6. Callback сопоставляется с unexpired pending state, валидируется атомарно и получает in-flight guard. Дубликат не вызывает второй token exchange. При restart восстановить SDK state в sessionStorage и использовать SDK code grant validation/PKCE/nonce; не писать свой OAuth-клиент.
7. Callback навигирует во внутренний flow без помещения code/state в постоянную историю и без логирования. После успеха дождаться keyring commit аккаунта, очистить pending и SDK временный state, активировать UI, показать/фокусировать окно.
8. Отказ пользователя, malformed/expired callback и ошибка обмена завершают flow с безопасным сообщением и возможностью нового login. Claim pending допускает сохранённую отметку processing; после аварии во время обмена требуется новый login, а не повторный обмен потенциально использованного code.
9. Loopback redirect принят как браузерно-нативная альтернатива custom scheme: нативный процесс Windows слушает `127.0.0.1:4201` и направляет callback в WebView;MAS `unredacted.org` должен принять loopback в регистрации. Это не бесшумный fallback: при отказе MAS показывается явная ошибка OIDC и доступен password fallback. Password fallback сам по себе достаточно, когда homeserver не читает loopback или provider отвергает регистрируемый URI, но он не закрывает desktop OIDC приёмку. Пользователь подтвердил приёмку на `unredacted.org`: там должны пройти реальные warm/cold callback и вход. Отказ MAS или несовместимый WebView origin — blocker. Если non-media CORS потребует более широкого native transport, согласовать отдельно, не превращать узкий media fetch в generic proxy.

## 7. Media, WASM и WebView

Не выключать CSP и не включать broad asset/file scopes для удобства сборки. Конкретная CSP разрешает локальные assets, необходимый WASM compilation, blob media и HTTPS соединения к выбираемым homeserver/MAS. Dev имеет отдельные localhost/HMR разрешения. Внешние navigation/popup не получают native IPC.

Browser adapter сохраняет SW-based authenticated media. Desktop не полагается на SW: получает медиа через authenticated fetch к активному homeserver и выдаёт UI blob URL через async media resolver/hook. URL проверяется против baseUrl и разрешённых Matrix media paths; bearer не уходит на произвольный origin/redirect. SW не регистрируется в desktop.

Resolver общий для аватаров и attachment preview/download, dedupe/cache ограничены; object URLs освобождаются при unmount, account switch/logout и вытеснении. Refresh меняет token source, старый активный account не используется для нового запроса. SDK upload/send остаётся общим. Если browser CORS для media препятствует packaged Windows client, допускается узкий Rust fetch, ограниченный теми же validated Matrix media URLs; нельзя заменять его произвольным HTTP proxy.

Принятые решения по CSP и fetch должны подтверждаться packaged Windows smoke test: WASM initialization, IndexedDB persistence, E2EE и media, а не только Vite dev server.

### Согласованное расширение: encrypted attachments

Подтверждено по текущему `use-timeline.ts:319-343` и SDK `http-api/index.ts:130-135`: `uploadContent(file)` отправляет исходные байты; шифрование event через `sendMessage` не шифрует уже загруженный media blob. Поэтому общая формулировка E2EE выше пока не означает защиту содержимого вложений.

Пользователь одобрил включение стандартного Matrix encrypted attachments v2 в shared web/desktop-код. В encrypted room для каждого вложения создаются fresh AES-256 key и IV; файл шифруется AES-CTR до upload, upload получает только ciphertext (без исходного filename/MIME в запросе), descriptor `file` содержит `mxc://`, JWK key, IV и SHA-256 ciphertext. Descriptor, имя и MIME передаются внутри Megolm-encrypted room event. При приёме сначала расшифровывается событие SDK, затем скачивается ciphertext, проверяется hash и расшифровывается файл локально; plaintext preview — memory blob URL с очисткой. Новые thumbnails, если создаются, шифруются отдельно, не через серверный plaintext thumbnail endpoint. В unencrypted room остаётся обычная отправка. Ошибка crypto не допускает plaintext fallback в encrypted room. Межклиентная совместимость с Element и rejection повреждённого ciphertext входят в приёмку. Уже отправленные plaintext blobs автоматически защищёнными не становятся.

## 8. Tray и обновления

- Нативный tray с иконкой из существующего branding assets либо технической нейтральной иконкой. Создание нового визуального бренда не входит в работу.
- Закрытие main window скрывает окно и продолжает sync; открытие/клик возвращают его. «Выход» завершает процесс, не делает Matrix logout и не удаляет аккаунт.
- Проверка updater при запуске неблокирующая, и вручную через tray/настройки. Фоновая ошибка сети не ломает chat; ручная проверка показывает результат.
- Доступная новая stable версия вызывает предложение обновить. UI через `libs/ui` proxy components, строки в EN/RU. Download/progress/error явно видимы. Приложение не выходит до подтверждения установки.
- Перед Windows install дождаться всех pending credential writes; сохранить draft сообщения (несекретные UI данные) либо явно предупредить пользователя о его потере. На Windows plugin сам завершает процесс для запуска installer; «Выход»/close handler не блокируют updater shutdown.
- HTTPS endpoint и обязательная Tauri signature validation; public key в production config, private key только в GitHub Secrets/внешнем безопасном резервном хранении. Никаких real/default/fake signing keys в Git.
- Authenticode не включён: Windows SmartScreen может предупреждать об издателе. Это отдельно от updater signature.

## 9. CI, сборки и релизы

### PR и default branch

`.github/workflows/ci.yml`: `pull_request`, push в фактическую default branch (`master`), ручной запуск. Read-only permissions, concurrency/cancellation, npm ci на закреплённых совместимых Node/npm версиях, локальные Nx cache keys без секретов. Проверка всего workspace `npx nx run-many -t typecheck,lint,test,build` в non-watch CI режиме, сохранение только allowlisted build/test artifacts.

Отдельный Windows job с Rust/MSVC/WebView2 prerequisites: cargo fmt --check, clippy с deny warnings, cargo test и desktop NSIS build без production-signing secrets. CI build не публикуется как auto-updatable release; production updater включается через release config overlay. Native packaging не кэшировать так, чтобы Nx мог пропустить подпись/инсталлятор. Desktop targets проверяются отдельно на Windows, JS targets остаются в общем gate (без требования Windows toolchain на Linux).

Добавить explicit landing typecheck; не считать, что `run-many` проверил проект без target. Проверить Nx inputs/output для desktop mode и landing export. Полная проверка локально до PR остаётся обязательной; Windows native gate — отдельной командой. Если runner image использует неподдерживаемые версии, зафиксировать совместимые, а не `latest` вслепую.

Docker build/config/smoke job на Linux проверяет compose и HTTP routes без реальных доменов/сертификатов/homeserver credentials, с тестовым HTTP override.

### Tag release

`.github/workflows/release-desktop.yml`: stable `vX.Y.Z` tag, reachable from default branch, tag SemVer должен совпадать с desktop package/Cargo/Tauri версией. Обязательные проверки переиспользуются до публикации. Tauri Bundler строит NSIS, Updater Plugin artifacts подписываются, публикуются installer, `.sig`, `latest.json` и web/landing builds при необходимости. Changelog/release notes генерируются из Conventional Commits; конкретный инструмент оставлен исполнителю.

Релиз сначала draft; становится public только после проверки manifest version/platform/url/signature и полного набора assets. Никаких latest.json, указывающих на несуществующий artifact. `windows-x86_64` — единственная платформа. Production endpoint фиксирован на `https://github.com/AshenHermit/SewerNet/releases/latest/download/latest.json`.

Repo configuration prerequisites: публичный updater key как repository variable, private key/password как Actions secrets, protected environment/tag policy для release. Без ключей tag release должен явно завершаться ошибкой, не выпускать unsigned production update. PR от forks не получает секреты; не использовать `pull_request_target` для исполнения PR кода с write permissions.

Настройка реальных ключей, branch protection, публикация первого релиза и проверка обновления с версии A на B требуют участия владельца. Не считать их сделанными после добавления YAML.

## 10. Production compose

- Корневой `compose.yaml` и `deploy/` с Caddy configs/HTTP smoke override и `.env.example` без секретов.
- Multi-stage Dockerfiles с npm ci/root lockfile, build этапом Nx и минимальным runtime. Docker context исключает Git, node_modules/build caches, `.env*` (кроме примеров), CREDENTIALS, подписи/ключи, локальные агентские файлы.
- Сервисы: backend (NestJS runtime, non-root, internal :3000), landing (Next static export через минимальный static server), reverse-proxy (Caddy HTTP + web Vite build + маршрутизация landing). Web не получает отдельный Node server.
- Host routes вида `${SITE_SUBDOMAIN}.${COMMON_DOMAIN}` и `${APP_SUBDOMAIN}.${COMMON_DOMAIN}`; значения subdomain конфигурируемые, предлагаемые примеры `sewer-net` и `sewer-net-app`. Landing `/` и статические/dev-log routes; app `/` и SPA fallback для `/welcome`, `/oidc/callback` и внутренних маршрутов. JS/WASM MIME корректны, `/sw.js` и app shell без длительного cache, hashed assets immutable.
- Backend не получает host port и отсутствует в публичных Caddy routes по умолчанию. Для внешних интеграций документировать private network/VPN/SSH forwarding; публичный режим требует отдельной задачи upstream allowlist/SSRF protection и gateway authentication. Нельзя называть текущий API безопасным публичным прокси.
- Caddy слушает только HTTP внутри deployment: `auto_https off`, без ACME, сертификатов, TLS volumes, redirect на HTTPS и host :443. Корневой Nginx пользователя сохраняет исходный Host и proxy-pass на Caddy. Для Nginx на хосте default published port только loopback (`127.0.0.1:${ROUTER_PORT}:80`); для контейнерного Nginx документировать подключение через явно выбранную ingress network без публикации порта. Backend/landing не присоединяются к ingress network; router связывает ingress с внутренней сетью сервисов.
- Внешний URL приложения остаётся HTTPS благодаря корневому Nginx: secure context для browser WebCrypto/service worker и OIDC обязателен. Не менять HTTPS updater endpoint из-за внутреннего HTTP. В README дать пример Nginx forwarding, не редактировать существующий сервер пользователя.
- Backend stateless, внешние Matrix/MAS не запускаются. Restart policy и healthchecks без реального login. Не управлять внешними 80/443 и сертификатами пользователя.
- Добавить `/api/health` с минимальным ответом и тестом, не вызывающим homeserver. Bind/runtime PORT явно поддерживаются; upstream proxy env остаётся opt-in, не копируется из локального `.env` автоматически.
- `.env.example` задаёт `COMMON_DOMAIN`, `SITE_SUBDOMAIN`, `APP_SUBDOMAIN`, `ROUTER_PORT` и необязательные proxy env, без ACME email/ключей. CI smoke использует HTTP и Host headers, prod ожидает существующий Nginx с DNS/TLS.
- Проверить standalone зависимости backend: текущий webpack `generatePackageJson: false`; runtime должен получать необходимые внешние зависимости, а не весь dev node_modules. Допускается Nx prune/copy workspace modules после настройки generated manifest.
- `README.md`, `apps/desktop/README.md`, `deploy/README.md`, `ARCHITECTURE.md` и ROADMAP описывают реальную схему и команды, секреты/release prerequisites и различие dev/production.

## 11. Приёмка и доказательства

### Автоматические проверки

- Browser regression: прежние accounts keys/поведение, OIDC/password, refresh/logout, UI architecture и responsive tests.
- Platform: bootstrap ожидает загрузку; keyring failure не вызывает browser fallback; durable write ordering/rollback и отсутствие повторных auth writes.
- Rust: roundtrip/delete/index, chunks на границах 2048/2560 и длинный JWT/SDK state, corruption/partial generation, concurrent writes, storage failures и отсутствие plaintext persisted copies. Native integration только собственный тестовый namespace; cleanup после теста.
- OIDC: точный redirect/native registration, save-before-open, cold/warm callback, state/TTL/replay/error, успешное сохранение аккаунта после grant. Тесты не используют реальные учётные данные.
- Media: bearer origin/path scope, redirect safety, token refresh, blob cleanup и смена аккаунта; browser SW regression.
- Encrypted attachments: upload содержит ciphertext, fresh key/IV, Matrix v2 descriptor внутри encrypted event, hash verification до использования файла, повреждённый ciphertext отклоняется; отсутствие plaintext fallback, original filename/MIME в upload и plaintext thumbnails. Roundtrip с эталонными данными, обычные вложения в unencrypted rooms не регрессируют.
- Updater: no update/network failure, progress/cancel-before-install, flush writes, invalid signature rejected; конфиг/manifest/version validation.
- Nx полная проверка + Windows native gate + Docker compose config/build/smoke.

### Ручной packaged Windows checklist

Установить NSIS; открыть/скрыть/восстановить tray; парольный вход и OIDC на `unredacted.org` через системный браузер; callback при работающем приложении и после закрытия процесса до возврата; restart с восстановлением аккаунта; E2EE и history pagination; загрузка/отправка/просмотр media. В encrypted room проверить отправку SewerNet → Element и приём Element → SewerNet файлов/изображений, локальную расшифровку и отказ при повреждённом ciphertext. Проверить refresh, logout и удаление keyring records. Инспекция WebView localStorage не обнаруживает токены. Провести обновление A → B с реальным public key и проверить отказ для испорченного artifact.

### Prod checklist

Smoke на HTTP с Host headers для `${SITE_SUBDOMAIN}.${COMMON_DOMAIN}` и `${APP_SUBDOMAIN}.${COMMON_DOMAIN}`: landing, app SPA callback, sw.js, WASM/assets, internal health; неизвестный Host не отдаёт сервисы, публичный backend route недоступен; Caddy не делает HTTPS redirect и не требует сертификатов. На реальном хосте: forwarding существующего Nginx с сохранением Host, внешний DNS/TLS и OIDC web callback с app-subdomain.

### ROADMAP

Отмечать каждый пункт только после его соответствующих доказательств. Если production updater ещё не проверен из-за ключей/публикации либо Docker недоступен, документировать blocker и оставить связанный пункт незавершённым; не выдавать инфраструктурный scaffold за завершённый MVP.

## 12. Порядок и оставленные решения

Предлагаемый порядок одного интегрированного проекта: базовая CI → storage/bootstrap → encrypted attachments и desktop OIDC/media/lifecycle → installer/updater и release CI → compose → полная проверка/review/документация.

Workflow репозитория: Issue → feature branch → PR с review, без автоматического merge. Текущий workspace чистый, ветка `feat/mvp-step-2`; перед реализацией использовать isolated worktree/feature branch, не переписывая существующую ветку. Дизайн и план живут в `docs/superpowers/{specs,plans}`.

Исполнитель выбирает точные имена адаптеров/IPC, версии поддерживаемых crates/plugins и Action revisions, тестовые инструменты, механизмы bounded cache и native dialogs/proxy UI, размеры окна, reuse существующих icons и инструмент changelog. Эти решения не меняют пользовательский объём. Значимое расширение (публичная API security, перенос OAuth/Matrix в Rust, другая ОС или Authenticode) требует нового согласования.

## 13. Дизайн-чеклист

- [x] Изучены ROADMAP, архитектура, accounts/auth bootstrap, OIDC SDK storage, media, Nx targets и серверные сборки.
- [x] Пользователь выбрал подход и нативные технологии.
- [x] Дизайн записан; одобренные решения отделены от оставленных исполнителю деталей.
- [x] Независимый builder check; пользователь разрешил вопросы по encrypted attachments, целевому MAS и defaults, уточнил TLS-terminating Nginx/HTTP-only Caddy.
- [x] Пользователь одобрил этот документ целиком 2026-11-18.
- [ ] Дизайн закоммичен; implementation plan написан через writing-plans.
- [ ] Реализация, review и доказательства приёмки.

## Источники технических ограничений

- https://spec.matrix.org/latest/client-server-api/#sending-encrypted-attachments — encrypted attachments v2, AES-CTR, ciphertext hash и descriptor внутри encrypted event.
- https://v2.tauri.app/plugin/deep-linking/ — Windows argv, single-instance ordering, cold/warm callback, dev registration.
- https://v2.tauri.app/plugin/updater/ — обязательная подпись, HTTPS, NSIS artifacts и auto-exit Windows installer.
- https://docs.rs/keyring/latest/keyring/ — актуальная архитектура экосистемы keyring.
- https://docs.rs/windows-native-keyring-store/latest/windows_native_keyring_store/ — Windows backend, persistence и сериализация доступа.
- https://learn.microsoft.com/en-us/windows/win32/api/wincred/ns-wincred-credentialw — размер credential blob и case-insensitive target names.
- `apps/web/node_modules/matrix-js-sdk/src/oidc/authorize.ts` — SDK `mx_oidc_` sessionStorage и восстановление SigninState.
