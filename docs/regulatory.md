# Enquadramento regulatório (SaMD / ANVISA)

**Não é parecer regulatório.** Validação clínica, classificação de risco, notificação/registro na ANVISA e revisão jurídica **não podem ser feitos por código nem por este repositório**; são responsabilidade do dono do produto (fabricante) com responsável técnico, assuntos regulatórios e jurídico. Este arquivo só organiza as perguntas.

## 1. É dispositivo médico (SaMD)?

Depende da **finalidade pretendida** declarada, não da tecnologia. Perguntas para decidir (RDC 657/2022 trata de software como dispositivo médico; RDC 751/2022 de classificação de risco e regularização; confirme a norma vigente):

- O software é usado para **diagnóstico, triagem, acompanhamento ou decisão clínica**, ou só para visualizar e consultar imagens já laudadas/de referência?
- Há **medições** (régua, ângulo, ROI, HU) usadas em decisão clínica? A exatidão de calibração (PixelSpacing) passa a ser requisito.
- Há processamento que altera a imagem (janelamento, MPR, volume, reformatação) que o médico usa para laudar? Visualizadores para diagnóstico primário costumam ter exigência maior que visualização de referência/ensino.
- Há IA ou apoio à decisão (hoje o código tem apenas ganchos, sem modelo)?
- Quem usa (médico, técnico, paciente) e em que ambiente (hospital, telerradiologia)?

Se a resposta for "visualização de apoio, não para diagnóstico primário", declare isso explicitamente na finalidade e nas telas; se for diagnóstico, trate como SaMD com a classe de risco definida pelas regras de classificação.

## 2. Modelo de declaração de finalidade pretendida (preencher)

> O **<nome do produto>** é um software web destinado a **<exibir / medir / reformatar>** imagens médicas DICOM provenientes de PACS **<especificar>**, para uso por **<profissionais habilitados: especialidade>**, em **<ambiente>**. **<Não é / É>** destinado ao diagnóstico primário. **Não substitui** o julgamento clínico. Limitações: modalidades **<lista verificada em docs/compat-matrix.md>**, navegadores **<lista>**, exige monitor **<requisitos>** e calibração da estação. Contraindicações: **<ex.: não usar para diagnóstico em dispositivos móveis sem monitor certificado>**.

## 3. Gestão de risco (esboço ISO 14971)

1. Plano de gestão de risco e critérios de aceitabilidade (severidade x probabilidade).
2. Identificação de perigos, exemplos para este produto: imagem exibida com orientação/lateralidade trocada; medida com escala errada (PixelSpacing ausente exibido como mm; hoje a UI mostra px e aviso "sem calibração"); janelamento/inversão (MONOCHROME1) incorreto; corte da série errado/ordem incorreta; dados de outro paciente exibidos (cache, troca de estudo); anotação associada ao estudo errado; indisponibilidade em momento crítico; perda de anotações; falha silenciosa de decodificação.
3. Análise e avaliação por perigo; controles (design, proteção, informação de segurança); verificação de cada controle (testes, ex.: `e2e/phantom.spec.ts` para escala).
4. Risco residual global, relatório de gestão de risco, revisão pós-produção (feedback de campo, `docs/operations.md`).
5. Rastreabilidade perigo -> requisito -> teste -> resultado.

## 4. Protocolo de validação clínica (esboço)

1. Objetivo e hipótese (ex.: equivalência de renderização/medida com visualizador de referência já aprovado).
2. Desenho: conjunto de estudos representativo (modalidades, transfer syntaxes, fabricantes, casos limite); critérios de inclusão/exclusão; **dados anonimizados e aprovação do CEP/CONEP se envolver pacientes**.
3. Métodos: leitores qualificados, comparação cega com a referência, métricas (diferença de medida em mm, concordância de janelamento, tempo de carregamento), tamanho amostral justificado.
4. Critérios de aceitação definidos antes de executar; desvios registrados.
5. Relatório assinado, anexado ao dossiê técnico.

## 5. Também necessário (fora do código)

Sistema de gestão da qualidade (ISO 13485 / RDC 665/2022 BPF), ciclo de vida de software (IEC 62304), usabilidade (IEC 62366), cibersegurança (guia ANVISA/IMDRF; `docs/security.md`), rotulagem e IFU, vigilância pós-mercado (tecnovigilância), proteção de dados (`docs/lgpd.md`).

## 6. O que este repositório já oferece como insumo

Matriz de compatibilidade honesta (`docs/compat-matrix.md`), testes automatizados (`docs/testing.md`), medidas de carga (`docs/load-test.md`), trilha de auditoria de acessos, migrações versionadas, CI. Nenhum deles constitui evidência clínica.
