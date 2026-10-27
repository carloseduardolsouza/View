# Teste de carga

Script: `scripts/load-test.mjs` (Node puro, sem dependências).

```
node scripts/load-test.mjs --url http://127.0.0.1:3000 --steps 1,4,8,16 --seconds 10
```

Rampa de clientes concorrentes; mistura de requisições 10% lista de estudos, 20% metadata da série, 70% um frame aleatório. Para ao primeiro degrau com mais de 2% de respostas não-2xx (`--max-error`), para não derrubar um PACS que já está sofrendo.

## Resultado real (uma execução, 2026-10-22)

Ambiente: máquina de desenvolvimento Windows 11, API em `tsx` (Node 24) e Orthanc 24.10 em container WSL, tudo em loopback, sem nginx/TLS. Estudo: CT com 703 instâncias (série usada: 281 cortes, 512x512, Explicit VR LE, ~0,5 MB/frame). A API sob teste era uma segunda instância na porta 3903, com `RATE_LIMIT_MAX` alto e um banco temporário (restaurado de backup e descartado depois), para não interferir no dev server nem poluir `audit_log`.

| Clientes | req/s | studies p50/p95 | metadata p50/p95 | frame p50/p95/p99 | frames MB/s | metadata MB/s | erros |
|---|---|---|---|---|---|---|---|
| 1 | 22,5 | 68 / 134 ms | 78 / 121 ms | 27 / 61 / 128 ms | 8,5 | 18,4 | 0 |
| 4 | 55,3 | 137 / 243 ms | 106 / 160 ms | 46 / 92 / 136 ms | 20,2 | 52,3 | 0 |
| 8 | 83,9 | 163 / 254 ms | 138 / 220 ms | 67 / 117 / 154 ms | 31,3 | 76,4 | 0 |
| 16 | 84,2 | 257 / 651 ms | 275 / 414 ms | 145 / 234 / 307 ms | 31,7 | 76,4 | 0 |

Leitura:
- A vazão satura em ~84 req/s (~108 MB/s somando frames e metadata) a partir de 8 clientes; com 16 a latência dobra sem ganho de vazão, ou seja, o gargalo é o PACS/loopback e não a API (a API só repassa o stream). Frame p95 abaixo de 250 ms até 16 clientes, 0 erros em 2 523+ requisições `/dicomweb`.
- Limites desta medição: uma só execução, sem repetição estatística; loopback (sem latência de rede real); dados descomprimidos; Orthanc compartilhado com outras atividades da máquina; não mede o navegador (decodificação, GPU).
- Achado: o rate limit padrão da API (`RATE_LIMIT_MAX`, 1200 req/min por IP) é menor que o que um único usuário gera rolando uma série longa (≈22 req/s com 1 cliente = 1350/min). Em produção use `RATE_LIMIT_MAX=6000` (já é o default do `docker-compose.prod.yml`) ou ajuste conforme o uso.
- Também observado: o Orthanc transcodifica JPEG Lossless para descomprimido, e um frame de CR chega com 15–44 MB (ver `docs/compat-matrix.md`).

## Teste do circuit breaker (PACS fora)

Segunda instância da API apontando para `ORTHANC_URL=http://127.0.0.1:1` (porta fechada), 8 requisições seguidas a `/dicomweb/studies`: as 5 primeiras falharam com 503 em ~0,6 s (3 tentativas com backoff cada), depois o breaker abriu e as 3 seguintes responderam 503 `pacs_circuit_open` em ~0,2 s. `/readyz` devolveu `orthanc:false, breaker:"open"` e `/metrics` mostrou `proxy_upstream_errors_total{reason="network"} 15`, `{reason="circuit_open"} 3`. A recuperação (half-open → closed) está coberta pelo teste unitário `resilience.test.ts`; não foi exercitada ao vivo com um PACS real voltando.
