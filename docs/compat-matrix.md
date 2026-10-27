# Matriz de compatibilidade

Estado honesto: só consta como "verificado" o que foi observado de fato. Última atualização: P6, medido contra o Orthanc de desenvolvimento (18 séries, 716 instâncias).

## O que o Orthanc de desenvolvimento contém (via REST `/instances/{id}/metadata/TransferSyntax`)

| Modalidade | Transfer syntax | Séries | Instâncias |
|---|---|---|---|
| CR | Implicit VR Little Endian (1.2.840.10008.1.2) | 7 | 11 |
| CT | Explicit VR Little Endian (1.2.840.10008.1.2.1) | 10 | 704 |
| CR | JPEG Lossless SV1 (1.2.840.10008.1.2.4.70) | 1 | 1 |

## Matriz

| Item | Estado | Notas |
|---|---|---|
| Entrega de frames pela API (`/dicomweb/.../frames/1`) | verificado (HTTP 200) | CT: 524 812 bytes (512x512x16 bit + multipart). Testado em `scripts/load-test.mjs`. |
| CR Implicit VR LE e JPEG Lossless | entrega verificada, **o Orthanc transcodifica** | O Orthanc devolve `transfer-syntax=1.2.840.10008.1.2.1` (descomprimido) mesmo para o JPEG Lossless: um frame de CR chega com 15–44 MB. O caminho de decodificação JPEG no navegador **não** é exercitado com este PACS. |
| Renderização no navegador (CT/CR) | ver `docs/testing.md` | Cobertura dos specs Playwright (agente A); não foi verificada por este documento. |
| Navegadores | não testado | alvo: Chrome/Edge atuais; exige WebGL2 (detectado e reportado por `apps/web/src/telemetry.ts`). Firefox/Safari: não testado. |
| MR (não comprimido) | não testado | sem estudo MR no Orthanc de desenvolvimento |
| JPEG baseline/extended, JPEG-LS, JPEG 2000, HTJ2K, RLE (decodificação no cliente) | não testado | decoders WASM vêm com o dicom-image-loader; exigiria PACS que sirva a syntax original (ou `DicomWeb` sem transcodificação) |
| Multiframe | não testado | frames expandidos em getSeriesFrames |
| PET, DX, SR, SEG, RTSTRUCT | não testado | |
| Outros PACS (dcm4chee, Orthanc de produção) | não testado | o proxy fala com `{ORTHANC_URL}/dicom-web/`; dcm4chee usa outro prefixo |
| Desempenho com carga | medido em `docs/load-test.md` | só frames CT descomprimidos |
| Ordenação de cortes | ver `packages/dicom-client` (`orderFrames`) | geométrica quando há ImagePositionPatient, senão InstanceNumber |
