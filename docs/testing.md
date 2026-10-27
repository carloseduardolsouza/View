# Testes

Tudo roda contra os servidores de desenvolvimento ja ativos (`npm run dev`: web :5173, API :3000) e o Orthanc real (:8042). Nada sobe ou derruba servidores. O Playwright usa o Chrome instalado (`channel: 'chrome'`), sem baixar navegador.

| Comando | O que roda |
|---|---|
| `pnpm test` | unitarios (vitest) de todos os pacotes; ignora `*.int.test.ts` |
| `pnpm typecheck` | tsc em todos os pacotes |
| `pnpm --filter @view/api test:int` | integracao da API (API e Postgres reais) |
| `pnpm e2e` | todos os specs Playwright (`e2e/`) |
| `pnpm e2e e2e/leak.spec.ts` | um spec so |

## O que cada suite prova

- `apps/api/src/api.int.test.ts`: anotacao create/update/delete com `version` e linhas em `annotation_history`; sem duplicar ao atualizar; delete idempotente; 400 (uid, estudo, corpo invalidos), 413, 409 (uid em outro estudo), 404; round trip de `/preferences`; `/dicomweb` so aceita `studies` e caminhos de estudo, e nao escapa de `/dicom-web` com `..`. Remove do banco o que cria e restaura as preferencias.
- `e2e/viewer.spec.ts`: worklist lista todos os estudos do Orthanc; CT renderiza pixels nao pretos; roda do mouse troca o corte; medida Length e salva, volta uma unica vez apos recarregar; ferramenta de texto abre `textarea.inline-text` e salva (`window.prompt/alert/confirm` lancam erro se chamados); layouts 1/2/4 renderizam imagem em todas as celulas; atalho `4`; ocultar/mostrar paineis mantem a proporcao do buffer do canvas igual a da caixa (imagem nunca esticada); arrastar um cartao de serie para uma celula (eventos reais de drag).
- `e2e/leak.spec.ts`: abre/fecha o CT 20 vezes sem recarregar a pagina. Mede o heap JS (CDP `Performance.getMetrics`, apos `HeapProfiler.collectGarbage`) e conta canvases WebGL ainda vivos via `WeakRef` (nao so os no DOM). Limites: heap < +40 MB (medido: ~+1 MB, 64 MB estavel) depois de 3 ciclos de aquecimento (o cache do Cornerstone e limitado e satura nos primeiros ciclos; um vazamento por abertura, de um StackView/canvas retido, custaria muitos MB por ciclo e estouraria); canvases WebGL vivos <= linha de base + 2 (medido: 0 vivos apos GC; a sonda tambem exige ter visto contextos WebGL, para nao ser vazia).
- `e2e/phantom.spec.ts`: gera um DICOM sintetico (`e2e/dicom.ts`, escritor Part 10 minimo) 256x256 com quadrado de 100 px. Com `PixelSpacing` 0,5 mm a medida Length entre as bordas deve dar 50 mm (+-1,5 mm). Sem `PixelSpacing` deve mostrar px, o aviso "sem calibracao" e nunca mm. Os estudos enviados ao Orthanc (POST /instances) sao apagados no `afterAll`, inclusive em falha.

## Limites conhecidos

- Os testes compartilham Orthanc e banco: `workers: 1`. As anotacoes criadas nos specs sao apagadas via API no fim; se o processo for morto no meio, sobram medidas no estudo CT e/ou estudos `FANTOMA^*` no Orthanc (apague-os manualmente).
- O spec de CT assume que existe um estudo com modalidade CT que nao seja `FANTOMA*`.
- Renderizacao depende de WebGL por software (swiftshader) no Chrome headless: e mais lenta que GPU; o limite de pixels "nao pretos" (3%) e heuristico.
- A medida do fantoma tem tolerancia de pixel de tela (~0,4 px de imagem por pixel de tela); nao substitui validacao com fantomas fisicos.
- O leak test mede o processo da pagina, nao a memoria de GPU.
- Seletores dependem de `aria-label`/roles em portugues e das classes `.vp`, `.ov.bl`, `.s-row`, `.item`; renomear a UI exige ajustar `e2e/`.
