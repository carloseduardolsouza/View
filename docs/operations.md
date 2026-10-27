# Operação

## Arquitetura de produção (`infra/docker-compose.prod.yml`)

`proxy` (nginx, TLS, headers, limites) -> `web` (nginx estático) e `api` (Fastify) -> Postgres e Orthanc **externos** (`DATABASE_URL`, `ORTHANC_URL`). A API não publica porta. `--profile db` adiciona um Postgres; `--profile tools` habilita o serviço `migrate`.

Primeira instalação:

```bash
cp .env.production.example .env.production        # preencher; nunca versionar
scripts/make-dev-cert.sh viewer.exemplo.org        # SÓ teste; em produção coloque fullchain.pem/privkey.pem de uma CA em CERT_DIR
C="docker compose --env-file .env.production -f infra/docker-compose.prod.yml"
$C build && $C run --rm migrate && $C up -d
```

Validações feitas neste repositório: `nginx -t` (proxy e web) e `docker compose config` OK; imagem da API construída, subiu e respondeu `/readyz`, encerrou com SIGTERM gracioso. A imagem `web` depende de `pnpm build` do front passar (ver relatório do P6 para o estado no dia).

## Release e rollback

Imagens são versionadas por `VERSION` (`${REGISTRY}/api:${VERSION}`, `${REGISTRY}/web:${VERSION}`); use tags imutáveis (semver ou SHA do commit), nunca `latest`.

**Rollout**
1. `scripts/db-backup.sh backups/pre-<VERSION>.dump` (copie para fora da máquina).
2. `docker compose ... build` com o novo `VERSION` (ou `pull` do registry).
3. `docker compose ... run --rm migrate` (aplica `apps/api/migrations/*.sql` pendentes, cada uma em transação).
4. `docker compose ... up -d` (recria `api`/`web`/`proxy`); conferir `curl -k https://HOST/api/readyz` e a métrica de 5xx por alguns minutos.

**Política de migração: somente para frente (forward-only).** Não há `down`. Para o rollback de código ser seguro, cada migração deve ser **compatível com a versão anterior** do código (expand/contract): primeiro adicionar colunas/índices (nullable ou com default), só remover/renomear em uma release posterior, depois que ninguém mais usa. Migração destrutiva exige backup e janela combinada.

**Rollback**
1. Código: `VERSION=<anterior>` no `.env.production` e `docker compose ... up -d`. Leva segundos e é suficiente se a migração foi compatível (caso normal).
2. Dados: só se a migração foi destrutiva ou corrompeu dados: `scripts/db-restore.sh backups/pre-<VERSION>.dump view_rollback` (cria um banco novo, nunca sobrescreve), validar, apontar `DATABASE_URL` para ele (ou renomear bancos com `ALTER DATABASE`, com a API parada) e subir a versão anterior. Anotações criadas depois do backup serão perdidas: decida conscientemente.
3. Registrar o incidente e corrigir "para frente" numa nova versão.

## Backup e restauração (Postgres da aplicação)

- `scripts/db-backup.sh [arquivo]` gera dump custom (`pg_dump -Fc`) via `DATABASE_URL`. `scripts/db-restore.sh <dump> [banco]` restaura em banco novo (recusa o banco ativo). Sem `pg_dump` local, usam um container `postgres:16` descartável via WSL; defina `PG_IMAGE` com a **mesma versão maior do servidor** (pg_restore rejeita dump de versão mais nova).
- Testado: backup e restauração em banco temporário (descartado) do Postgres de desenvolvimento; contagens batem, salvo escritas ocorridas entre dump e contagem.
- Agende diariamente (cron/systemd/Task Scheduler), mantenha cópias fora da máquina, **criptografadas**, e teste restauração periodicamente (um backup não testado não é backup).
- O Orthanc (imagens) tem backup próprio: volume de `StorageDirectory`/`IndexDirectory` ou o banco do Orthanc. Fora do escopo destes scripts.

## Retenção

`AUDIT_RETENTION_DAYS=365 scripts/audit-retention.sh` apaga linhas antigas de `audit_log` (índice `audit_log_at_idx`, migração 004). Agende diariamente. Se a trilha tem valor legal, exporte antes. `scripts/cleanup-legacy.sql` (usuários/grants antigos) é opcional e **destrutivo**: backup, leia o arquivo, rode manualmente.

## Política de atualização

- Dependências: `pnpm audit --prod` no CI (hoje falha por fastify/adm-zip, ver `docs/security.md`). Atualizações de segurança: dentro de 7 dias para severidade alta; demais, no ciclo mensal. Sempre `pnpm typecheck && pnpm test && pnpm build` + e2e antes de liberar.
- Imagens base (`node:24-alpine`, `nginx`, `postgres`): reconstruir ao menos mensalmente para receber correções.
- Cornerstone/decoders WASM: mudança de versão maior exige repetir `docs/compat-matrix.md` e `docs/load-test.md`.
- Certificados TLS: renovar antes do vencimento (alerta 30 dias).

## Monitoramento

- Liveness `GET /healthz` (usado pelo healthcheck do container); readiness `GET /readyz` (Postgres + Orthanc, 503 se algum falhar, mostra estado do breaker).
- `GET /metrics` (Prometheus, só rede interna; scrape `api:3000`): `http_requests_total{method,route,status}`, `http_request_duration_seconds`, `proxy_upstream_errors_total{reason}`, `breaker_open`, `audit_write_failures_total`, `client_telemetry_total{type}`.
- Alertas sugeridos: `breaker_open == 1` por >1 min; `rate(http_requests_total{status=~"5.."}[5m])` > 1%; `audit_write_failures_total` aumentando; p95 de `/dicomweb/*` acima do baseline de `docs/load-test.md`; picos de `client_telemetry_total{type="webgl"}` ou `decode`.
- Logs JSON no stdout (pino), com `reqId` igual ao `x-request-id` devolvido ao cliente e registrado no nginx. Query strings PHI são substituídas por `<redacted>`; UIDs por `<uid>`. Envie a um coletor (Loki/ELK) com retenção definida.

## Runbook de suporte

| Sintoma | Verificar | Ação |
|---|---|---|
| "Não consigo abrir nenhum exame" / 503 `pacs_circuit_open` | `/readyz` -> `orthanc:false`; Orthanc de pé? credenciais? | corrigir o PACS; o breaker volta sozinho em ~10 s após o primeiro sucesso |
| Lista vazia | `GET /dicomweb/studies` direto; Orthanc vazio ou `ORTHANC_URL` errado | conferir `.env.production` |
| Tudo 429 | `RATE_LIMIT_MAX`, `limit_req` do nginx, IP único atrás de NAT | subir limites com critério |
| Imagem preta / "WebGL" | telemetria `webgl` (`unsupported`/`context_lost`), GPU/driver, navegador | Chrome/Edge atuais, aceleração por hardware; reduzir layout (menos viewports) |
| Erro ao decodificar | telemetria `decode`; transfer syntax do estudo (`docs/compat-matrix.md`) | caso novo: registrar na matriz |
| Anotações não salvam | `/readyz` postgres; 5xx em `/annotations/*`; `audit_write_failures_total` | restaurar o Postgres; ver logs por `reqId` |
| Começou a falhar após release | `docker compose ... logs api` | rollback de código (seção acima) |
| Suspeita de acesso indevido | `audit_log` e logs do nginx | `docs/lgpd.md` (resposta a incidentes) |

Para correlacionar: peça o `x-request-id` (cabeçalho da resposta, aba Rede do navegador) e procure em `docker compose logs api proxy`.

## Encerramento gracioso

`SIGTERM`/`SIGINT` fecham o servidor (termina requisições em andamento) e o pool do Postgres; o compose dá 20 s (`stop_grace_period`).
