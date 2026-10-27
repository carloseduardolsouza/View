# Segurança

Checklist e modelo de ameaças, não parecer jurídico nem auditoria. Implementação de referência: `infra/` e `apps/api`.

## Decisão: sem login (deliberada)

O dono do projeto decidiu **não ter autenticação**. Toda requisição age como o usuário fixo `local@view.local` (papel admin); todos os estudos do Orthanc são visíveis; `study_grants` e `users` legados não são consultados. Isto só é aceitável enquanto:

- a API escuta apenas em `127.0.0.1` (padrão em dev; `HOST=0.0.0.0` só dentro do container, sem porta publicada), **e**
- a máquina/rede é confiável e dedicada, **e**
- os dados são de teste ou o acesso físico/de rede já é controlado por outra camada (VPN, firewall, rede hospitalar isolada).

**Qualquer exposição além do próprio computador exige, antes:**

1. Autenticação (OIDC/SSO da instituição ou login local com senha forte + MFA) e sessão com cookie `HttpOnly; Secure; SameSite=Strict`.
2. Autorização por instituição/estudo no servidor (o esquema `institutions`/`study_grants` ainda existe no banco para isso), aplicada em `/dicomweb/*`, `/annotations/*` e `/preferences`; `audit_log` com o usuário real.
3. TLS ponta a ponta (proxy em `infra/nginx`, certificado de CA real, HSTS).
4. CORS restrito à origem pública (`WEB_ORIGIN`); no deploy de referência não há CORS porque tudo é mesma origem.
5. Rate limit por usuário (hoje por IP: `RATE_LIMIT_MAX` e `limit_req` do nginx).
6. `/metrics` e `/readyz` fora da internet (o proxy de referência não roteia `/metrics`).
7. CSP em modo de reforço (já em `infra/nginx/security-headers.conf`), revisada após cada mudança de front.
8. Revisão de PHI em logs (abaixo) e política de retenção (`docs/lgpd.md`).

Sem estes itens, quem alcançar a porta lê todos os exames do PACS e cria/apaga anotações.

## Modelo de ameaças (resumido)

| Ativo | Ameaça | Mitigação existente | Lacuna |
|---|---|---|---|
| Imagens/PHI no Orthanc | acesso direto ao Orthanc | credenciais só no servidor da API; proxy `/dicomweb` somente GET | sem login: quem chega na API lê tudo |
| Credenciais do Orthanc | vazamento via navegador/log | nunca saem do servidor; header `authorization` redigido nos logs | `.env` em texto claro; use secret manager em produção |
| Anotações/preferências | adulteração, XSS armazenado | validação zod, limite de 64 KB, JSON renderizado pelo React, CSP | texto livre de anotação pode conter PHI |
| Logs | PHI em URL (`PatientName=...`) | `apps/api/src/logger.ts` redige chaves PHI e mascara UIDs; nginx loga `$uri` sem query | testes cobrem só as chaves conhecidas; revisar ao adicionar filtros |
| Telemetria do navegador | envio de PHI | cliente remove query strings e UIDs; servidor repete a limpeza, limita 4 KB e 30 req/min | mensagens de erro de terceiros podem trazer texto inesperado |
| Disponibilidade | PACS lento/fora, flood | retry + circuit breaker (503 rápido), rate limit nginx + API, timeouts | sem WAF/DDoS |
| Cadeia de suprimentos | dependência vulnerável | `pnpm audit --prod` no CI | ver achados abaixo |
| Banco | perda/corrupção | `scripts/db-backup.sh`/`db-restore.sh`, migrações só para frente | backup agendado e testado de restauração é responsabilidade do operador |

## Achados da verificação (2026-10-22)

- `pnpm audit --prod --audit-level high` **falha hoje**: `fastify` (apps/api, 5.6.1; corrigido em >=5.12.2) e `adm-zip` (transitiva de `dcmjs` via cornerstone; corrigido em >=0.6.1). O CI está configurado para falhar nisso de propósito. Atualizar o Fastify é o próximo passo (não feito por este agente: `package.json` da API não é dele).
- A CSP não foi exercitada em navegador por este agente (sem ferramenta de browser): valide em `Content-Security-Policy-Report-Only` antes de impor, procurando violações no console com visualizador CT aberto (workers `blob:`, WASM, fontes Google).
- Headers de segurança estão no proxy; o servidor de dev (Vite) não os envia.

## Superfície da API

`GET /dicomweb/*`, `GET|PUT|DELETE /annotations/*`, `GET|PUT /preferences`, `POST /telemetry`, `GET /healthz`, `/readyz`, `/metrics`. Nenhuma escrita no PACS. `/readyz` revela estado de dependências e `/metrics` volumes: mantenha ambos internos.
