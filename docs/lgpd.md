# LGPD: mapa de dados e pontos de atenção

**Isto não é parecer jurídico.** Dado de saúde é dado pessoal sensível (LGPD art. 5º, II e art. 11). Base legal, papéis (controlador/operador), RIPD e contratos devem ser definidos pelo controlador com o DPO e assessoria jurídica. Código não faz isso.

## Mapa de dados

| Onde | O que | PHI? | Retenção | Acesso |
|---|---|---|---|---|
| Orthanc (fora deste repo) | imagens DICOM e todas as tags (nome, ID, nascimento, acesso...) | **sim, a fonte** | política do PACS (não gerida aqui) | credenciais do Orthanc só no servidor da API; hoje, quem alcança a API lê tudo |
| Postgres `annotations` | UIDs de estudo/série, imagem, geometria da medida, autor (`local@view.local`) e **texto livre** | indireto (UID identifica o exame); texto livre pode conter nome/ID digitado pelo usuário | até apagar (soft delete `deleted_at`) | API sem login |
| Postgres `user_preferences` | preferências de interface | não | até apagar | idem |
| Postgres `audit_log` | quando, ação, `study_uid`, IP do cliente | indireto (UID + IP) | **configurável**: `scripts/audit-retention.sh` (padrão 365 dias) | acesso ao banco |
| Postgres legado `users`, `study_grants`, `institutions` | e-mails e hashes de senha antigos | dado pessoal (e-mail) | permanecem até `scripts/cleanup-legacy.sql` (opcional, não executado) | acesso ao banco |
| Logs da API (stdout JSON) | método, rota, status, latência, request-id, IP; **sem** query strings PHI e UIDs mascarados | não por projeto | definido pelo coletor de logs do operador | operador |
| Logs do nginx | IP, request-id, caminho (sem query) | indireto (UID no caminho, IP) | rotação do operador | operador |
| Telemetria do navegador | tipo de erro, mensagem curta sem URL/UID, tempos | não por projeto | só logs/métricas | operador |
| Navegador do usuário | cache do Cornerstone (pixels em memória), `localStorage` de tema | pixels sim, em memória durante a sessão | até fechar a aba | usuário |
| Backups (`scripts/db-backup.sh`) | cópia das tabelas acima | indireto | defina; apague dumps antigos | quem acessa o disco; **criptografe** em repouso |

## Princípios aplicados no código

- Minimização: a aplicação não copia imagens nem tags demográficas para o próprio banco.
- Logs sem PHI direto (testes em `apps/api/src/resilience.test.ts`); limpeza também do lado servidor para a telemetria.
- Retenção do `audit_log` com job e índice (migração 004).

## O que o controlador precisa providenciar (fora do código)

- Base legal e finalidade (tutela da saúde, art. 11, II, "f"; ou consentimento), registro das operações (art. 37) e **RIPD** quando aplicável (art. 38).
- Nomear encarregado (DPO) e canal para titulares (acesso, correção, eliminação).
- Contratos com operadores (hospedagem, backup). Transferência internacional, se a nuvem for fora do Brasil.
- Controle de acesso real (autenticação/autorização, `docs/security.md`) e trilha de auditoria com usuário identificado.
- Criptografia em repouso (disco/Postgres/backups) e em trânsito (TLS).
- Política de retenção do `audit_log`, anotações e backups; procedimento de eliminação a pedido do titular (anotações vinculam-se a UID de estudo: localizar por `study_uid`).

## Resposta a incidentes (esboço)

1. Detectar: alertas de `/metrics` (picos de 4xx/5xx, `audit_write_failures_total`), logs, relato de usuário.
2. Conter: derrubar o proxy (`docker compose stop proxy`), rotacionar `ORTHANC_PASSWORD`/`DATABASE_URL`, bloquear IPs.
3. Avaliar: quais estudos/UIDs foram acessados (`audit_log` por período e IP; logs do nginx por request-id), se houve acesso a PHI.
4. Comunicar: DPO decide sobre ANPD e titulares (prazo regulatório: a ANPD orienta comunicação em até 3 dias úteis; confirme a norma vigente).
5. Corrigir e registrar a causa raiz e as ações; revisar este documento.
