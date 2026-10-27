# View

Visualizador DICOM web. Plano: `docs/` e `~/.claude/plans`.

## Rodar (dev)
1. Pré-requisitos: Node 24, pnpm e um Orthanc com DICOMweb + um Postgres.
2. `cp .env.example .env` e ajuste `DATABASE_URL`, `ORTHANC_URL`, `ORTHANC_USER`, `ORTHANC_PASSWORD`.
3. `pnpm install && pnpm --filter @view/api migrate`
4. `npm run dev` → http://localhost:5173

Não há login: todos os estudos do Orthanc aparecem na lista e a API age como o usuário local `local@view.local`
(autor das medidas). A API só escuta em `127.0.0.1`; antes de expô-la fora da máquina, adicione autenticação.

## Produção, operação e conformidade
- Deploy (nginx com TLS, Docker, rollout/rollback, backup): `infra/docker-compose.prod.yml`, `.env.production.example`, [docs/operations.md](docs/operations.md).
- Saúde e métricas da API: `/healthz`, `/readyz` (Postgres + Orthanc), `/metrics` (Prometheus). Logs JSON sem PHI; PACS fora = 503 rápido (circuit breaker).
- Scripts: `scripts/db-backup.sh`, `db-restore.sh`, `audit-retention.sh`, `make-dev-cert.sh`, `load-test.mjs`; `cleanup-legacy.sql` é opcional e destrutivo.
- Segurança e a decisão de não ter login: [docs/security.md](docs/security.md). LGPD: [docs/lgpd.md](docs/lgpd.md). Regulatório (SaMD/ANVISA): [docs/regulatory.md](docs/regulatory.md) (validação clínica, registro e parecer jurídico são responsabilidade do dono do produto).
- Compatibilidade verificada: [docs/compat-matrix.md](docs/compat-matrix.md). Carga: [docs/load-test.md](docs/load-test.md).
- Telemetria do navegador: `apps/web/src/telemetry.ts` envia a `POST /telemetry` (sem PHI). Para o tempo até a primeira imagem, o Viewer deve chamar `reportTiming("time_to_first_image", ms)`; falhas de decodificação, `reportDecodeError(err, transferSyntax)`.
