# Plano de reconstrução de um visualizador DICOM para WEB inspirado no RadiAnt

**Documento técnico e roadmap de implementação**\
**Data:** outubro de 2026\
**Objetivo:** construir um visualizador médico web avançado, com fluxo
de trabalho familiar a usuários do RadiAnt, aproveitando a arquitetura
do OHIF e o ecossistema Cornerstone3D, integrado a um PACS como Orthanc.

> **Nota de escopo:** este documento é um levantamento técnico
> orientativo, não uma auditoria exaustiva de todas as versões e
> licenças do RadiAnt. Os recursos do RadiAnt variam conforme a versão e
> os módulos/licenças. A meta é alcançar paridade funcional por etapas,
> não copiar código, marca, ícones ou interface proprietária. Antes de
> uso clínico, o produto precisa de validação técnica, clínica,
> regulatória e de segurança apropriada.

------------------------------------------------------------------------

## 1. Recomendação executiva

O caminho mais fácil e sustentável é **customizar o OHIF Viewer v3**,
reutilizando suas extensões, modos, integração DICOMweb e componentes de
visualização baseados em Cornerstone3D. Não é recomendável desenvolver o
motor de imagens do zero.

### Stack recomendada

  ---------------------------------------------------------------------------
  Camada                      Tecnologia recomendada  Responsabilidade
  --------------------------- ----------------------- -----------------------
  Linguagem principal         **TypeScript**          Tipagem e manutenção de
                                                      uma aplicação grande

  Frontend                    **React**               Componentes, painéis e
                                                      interface

  Bundler                     **Vite** para módulos   Desenvolvimento e build
                              próprios; respeitar o   
                              pipeline do OHIF no     
                              monorepo                

  Base do visualizador        **OHIF Viewer v3**      Estrutura da aplicação,
                                                      extensões, modos e
                                                      integração com arquivos
                                                      DICOMweb

  Renderização 2D/3D          **Cornerstone3D**       Viewports, ferramentas,
                                                      pilhas, volumes e
                                                      interação

  Reconstrução/visualização   **Cornerstone3D +       MPR, volume rendering e
  volumétrica                 vtk.js**, conforme      visualizações avançadas
                              recurso e versão        

  API de negócio              **Node.js +             Autorização, auditoria,
                              TypeScript** (Fastify   integração RIS/PACS e
                              ou NestJS)              regras próprias

  PACS                        **Orthanc**             Armazenamento, consulta
                              inicialmente            e recuperação de
                                                      estudos

  Protocolo de imagem         **DICOMweb** (QIDO-RS,  Busca, recuperação e
                              WADO-RS, STOW-RS quando envio de objetos
                              necessário)             

  Banco de dados da aplicação **PostgreSQL**          Usuários, permissões,
                                                      preferências, auditoria
                                                      e dados de workflow;
                                                      não substituir o PACS
                                                      como arquivo de pixels

  Cache/filas opcionais       Redis e fila quando     Cache de metadados,
                              houver necessidade real jobs e tarefas
                                                      assíncronas

  Testes                      Vitest/Jest, React      Testes unitários,
                              Testing Library,        integração e fluxo no
                              Playwright              navegador

  Deploy                      Docker, Nginx e CI/CD   Distribuição, proxy,
                                                      TLS e atualização
                                                      controlada

  Observabilidade             Logs estruturados,      Diagnóstico de falhas e
                              métricas, tracing e     desempenho
                              alertas                 
  ---------------------------------------------------------------------------

**Escolha importante:** use OHIF como base de produto e faça
customizações em extensões/modos próprios. Evite manter um fork profundo
com mudanças espalhadas pelo núcleo, pois isso encarece atualizações
futuras.

### Referências oficiais para validar durante a implementação

-   OHIF --- arquitetura:
    https://docs.ohif.org/development/architecture/
-   OHIF --- extensões: https://docs.ohif.org/platform/extensions/
-   OHIF --- modos: https://docs.ohif.org/platform/modes/
-   OHIF --- repositório: https://github.com/OHIF/Viewers
-   Cornerstone3D --- documentação: https://www.cornerstonejs.org/docs/
-   RadiAnt --- site: https://www.radiantviewer.com/
-   RadiAnt --- manual PDF localizado na pesquisa:
    https://www.radiantviewer.com/dicom-viewer-manual/PDF/radiantmanual-2020.1.pdf
-   Orthanc --- documentação: https://orthanc.uclouvain.be/book/

As APIs e os nomes exatos dos pacotes mudam entre versões. Fixe versões
compatíveis e consulte a documentação correspondente à versão
selecionada antes de implementar.

------------------------------------------------------------------------

## 2. O que aproveitar da arquitetura do OHIF

O OHIF v3 é um monorepo com camadas separadas. A arquitetura ajuda a
criar uma aplicação própria sem reimplementar todos os serviços comuns
de um visualizador médico.

### Componentes relevantes

-   **`platform/app`**: inicialização, roteamento, registro e composição
    de extensões/modos.
-   **`platform/core`**: serviços e lógica comum da plataforma.
-   **`platform/ui`**: componentes visuais reutilizáveis.
-   **`extensions/default`**: funcionalidades gerais, lista de
    estudos/séries, datasource e configurações de visualização.
-   **`extensions/cornerstone`**: viewports e integração com Cornerstone
    para visualização 2D/3D.
-   **`extensions/cornerstone-dicom-sr`**: visualização e integração de
    DICOM Structured Reports, conforme suporte da versão.
-   **`extensions/cornerstone-dicom-seg`**: segmentações DICOM.
-   **`extensions/cornerstone-dicom-rt`**: fluxos de
    radioterapia/RTSTRUCT, conforme versão.
-   **`extensions/measurement-tracking`**: acompanhamento de medições ao
    longo do tempo.
-   **`extensions/dicom-pdf`** e **`extensions/dicom-video`**: conteúdo
    encapsulado em PDF e vídeo, quando suportado.
-   **`modes/`**: configurações de workflows que escolhem extensões,
    rotas, ferramentas e layouts.

### Como estruturar suas customizações

Crie extensões próprias para funcionalidades de negócio e ferramentas
adicionais. Crie modos para diferentes fluxos, por exemplo:

1.  `genus-diagnostic` --- visualização diagnóstica geral.
2.  `genus-comparison` --- comparação de estudos e séries.
3.  `genus-measurements` --- medições e acompanhamento.
4.  `genus-3d` --- MPR e visualização volumétrica.
5.  `genus-admin` --- configurações não diagnósticas, fora do viewport
    clínico.

Os nomes são exemplos; adapte-os ao produto. Uma funcionalidade
reutilizável deve ficar em uma extensão; um fluxo que combina extensões
deve ficar em um modo.

### Regras para não criar uma dívida técnica desnecessária

-   Não reimplemente o loader DICOM se Cornerstone/OHIF já cobrir o
    caso.
-   Não altere diretamente o núcleo do OHIF sem uma necessidade clara.
-   Não crie uma segunda camada de estado global que duplique os
    serviços do OHIF.
-   Mantenha comandos e ferramentas em módulos reutilizáveis, em vez de
    acoplar tudo à toolbar.
-   Documente cada patch upstream e prefira extensões próprias.
-   Fixe versões e faça atualização planejada, com testes de regressão
    em estudos reais anonimizados.

------------------------------------------------------------------------

## 3. Inventário funcional inspirado no RadiAnt

O inventário abaixo agrupa as capacidades de um visualizador desktop
avançado e indica o que deve ser planejado para uma versão web. Nem todo
recurso tem a mesma prioridade nem todo recurso está disponível pronto
em uma única biblioteca.

### 3.1 Abrir, pesquisar e navegar por exames

-   Lista de estudos por paciente, data, modalidade, instituição, médico
    solicitante e descrição.
-   Busca por Patient ID, accession number e outros atributos
    permitidos.
-   Navegação por estudo, série e instância.
-   Miniaturas e painel de séries.
-   Carregamento de estudo a partir de link autenticado.
-   Abertura de mais de um estudo para comparação.
-   Histórico de estudos recentes e retomada do trabalho.
-   Ordenação de séries e seleção de série inicial.
-   Indicação de quantidade de imagens, modalidade, orientação e
    parâmetros relevantes.
-   Suporte a estudos grandes com carregamento progressivo e
    pré-carregamento controlado.
-   Mensagens claras para estudo indisponível, instância inválida ou
    série parcialmente carregada.

### 3.2 Navegação e ferramentas 2D

-   Window/Level: brilho/contraste por janela e nível.
-   Presets de janela, especialmente para CT, conforme modalidade e
    protocolo.
-   Zoom, pan, ajuste à janela, tamanho real quando significativo e
    reset de viewport.
-   Rotação de 90 graus e rotação livre, se suportada.
-   Inversão de escala de cinza e espelhamento horizontal/vertical.
-   Navegação por cortes com roda do mouse, barra, teclado e controles
    acessíveis.
-   Cine playback para sequências apropriadas.
-   Layout de uma, duas, quatro ou mais viewports.
-   Tela cheia e maximização de uma viewport.
-   Sincronização de zoom, pan, window/level e posição entre viewports,
    quando aplicável.
-   Orientação do paciente e marcadores anatômicos.
-   Overlay de informações DICOM configurável.
-   Exibição de régua/escala quando a geometria permitir.
-   Captura de snapshot e exportação permitida.
-   Atalhos de teclado configuráveis.
-   Undo/redo para operações de anotação quando viável.
-   Presets e preferências por usuário.

### 3.3 Medições e anotações

-   Comprimento/linha.
-   Ângulo.
-   Ângulo de Cobb.
-   Distância perpendicular/desvio, se necessária ao fluxo.
-   Retângulo, elipse e ROI.
-   Área, perímetro, estatísticas e intensidade de pixels quando
    tecnicamente válidas.
-   Anotação com seta.
-   Desenho livre/pencil.
-   Texto e marcadores.
-   Medidas com unidades e precisão apropriadas.
-   Persistência de medições e anotações.
-   Edição, exclusão, seleção e lista de medidas.
-   Exportação ou persistência interoperável, quando aplicável.
-   DICOM SR para relatórios estruturados, se suportado no fluxo.
-   Rastreamento longitudinal de medições em estudos de datas
    diferentes.
-   Controle de autoria, data/hora e histórico de alterações.

**Ponto crítico:** medidas físicas dependem de metadados geométricos
válidos, calibração e orientação. Não mostrar uma medida em milímetros
como confiável quando a calibração estiver ausente ou inconsistente.

### 3.4 Comparação de estudos e séries

-   Duas ou mais séries em viewports simultâneas.
-   Comparação de exames anteriores e atuais.
-   Sincronização manual e automática entre séries compatíveis.
-   Sincronização por posição anatômica/orientação quando for possível.
-   Linhas de referência cruzada entre planos.
-   Cursor 3D ou referência de posição entre viewports.
-   Divisão de sequências em painéis.
-   Comparação de modalidades ou protocolos diferentes.
-   Regras para lidar com séries que não possuem geometria compatível.
-   Layouts de comparação guardados por protocolo.

### 3.5 MPR, 3D e processamento avançado

-   MPR ortogonal: axial, coronal e sagital.
-   MPR oblíqua e rotação do plano, se disponível no stack escolhido.
-   MIP (Maximum Intensity Projection).
-   MinIP (Minimum Intensity Projection).
-   Average intensity projection, se suportada.
-   Renderização volumétrica (VR) com presets de transferência.
-   Rotação, zoom e pan do volume.
-   Sincronização de cortes e cursor entre planos.
-   Recorte de volume e ferramentas de clipping, conforme implementação.
-   Snapshots de ângulos e presets de câmera.
-   Animações/filmes de rotação de volume.
-   Exportação de modelo 3D, por exemplo STL, apenas após definir uma
    pipeline de superfície/segmentação validada.
-   Aceleração GPU via WebGL/WebGPU conforme suporte real da biblioteca
    e do navegador.
-   Controles de memória e liberação de volumes quando o estudo é
    fechado.

Recursos avançados de volume exigem cuidado com tamanho dos dados,
espaçamento entre cortes, orientação, séries incompletas e memória GPU.
Não prometa paridade com um visualizador desktop sem testes em
diferentes placas de vídeo e navegadores.

### 3.6 Fusão multimodal e análise especializada

-   Fusão PET/CT e, quando necessário, fusão de outras modalidades
    compatíveis.
-   Ajuste de opacidade e alinhamento entre fontes.
-   Validação de geometria e registro entre séries.
-   Curvas tempo-intensidade (TIC) em estudos dinâmicos compatíveis.
-   Segmentação manual e overlays.
-   Segmentações DICOM SEG, quando suportadas.
-   Visualização de RTSTRUCT/objetos de radioterapia conforme extensão e
    modalidade.
-   Suporte a DICOM SR.
-   Ferramentas de IA como extensão isolada, com rastreabilidade e
    indicação de que são auxiliares.
-   Módulos especializados por modalidade e fluxo clínico.

Fusão, TIC e segmentação não devem ser tratadas como simples filtros de
tela: precisam de dados corretos, registro espacial, algoritmos testados
e representação clara de incertezas.

### 3.7 Formatos e objetos DICOM

Planejar uma matriz de compatibilidade explícita para:

-   CT, MR, CR/DX, US, PET, NM e XA, conforme as necessidades reais.
-   DICOM multiframe.
-   Cine e DICOM video, quando suportado.
-   DICOM SR.
-   DICOM SEG.
-   RTSTRUCT e objetos de radioterapia necessários.
-   PDF encapsulado e documentos associados.
-   Transfer syntaxes/compressões usadas pelos equipamentos reais.
-   Estudos com metadados incompletos ou não conformes.

Não presuma que o suporte a DICOM implica suporte a todas as transfer
syntaxes ou SOP Classes. Faça testes com arquivos representativos dos
equipamentos e serviços de origem.

### 3.8 Interface, produtividade e configuração

-   Tema escuro otimizado para leitura médica.
-   Barra de ferramentas configurável.
-   Painel lateral de estudos e séries.
-   Barra de status com metadados relevantes.
-   Menus de contexto e tooltips.
-   Atalhos configuráveis.
-   Protocolos de layout/hanging protocols.
-   Preferências por usuário e por modalidade.
-   Internacionalização.
-   Acessibilidade para controles que não dependam exclusivamente do
    mouse.
-   Indicadores de carregamento, erro, cache e conectividade.
-   Layout adaptável, priorizando desktop e monitores grandes.
-   Compatibilidade testada com múltiplos monitores; comportamento em
    navegadores pode diferir de aplicações desktop.

### 3.9 Integração com RIS/PACS e operação

-   Receber identificador do paciente/estudo de forma segura a partir do
    RIS.
-   Busca e recuperação via DICOMweb.
-   Autenticação e autorização por usuário, instituição, paciente e
    estudo.
-   Auditoria de acesso e de ações relevantes.
-   Controle de sessão e expiração.
-   URLs temporárias ou tokens de curta duração quando apropriado.
-   Persistência de preferências e layouts.
-   Gerenciamento de falhas e repetição de requisições.
-   Monitoramento de latência, erros de decode, memória e WebGL.
-   Logs sem expor dados pessoais desnecessariamente.
-   Configuração por ambiente e por instituição.
-   Backups e recuperação de configuração e banco da aplicação.
-   Versionamento e rollout/rollback de releases.

------------------------------------------------------------------------

## 4. Priorização das entregas

A prioridade deve ser guiada pelo valor clínico, risco técnico e
dependências. A estimativa de tempo depende do tamanho da equipe,
experiência e qualidade dos estudos de teste; as fases abaixo são
entregáveis, não promessas de prazo.

### P0 --- Fundação técnica

**Objetivo:** demonstrar que a aplicação abre estudos reais com
segurança e desempenho aceitável.

Entregas: 1. Escolher uma versão estável do OHIF e fixar versões das
dependências. 2. Criar ambiente local, desenvolvimento, teste e
produção. 3. Subir Orthanc com DICOMweb configurado. 4. Configurar
CORS/proxy e autenticação; evitar expor o PACS diretamente sem
controles. 5. Criar fluxo de acesso a estudos e séries. 6. Validar CT e
MR de amostras anonimizadas. 7. Exibir erros de rede, estudo incompleto
e objeto não suportado. 8. Criar pipeline de build e deploy. 9.
Registrar limitações de navegadores e codecs.

**Critério de aceite:** usuário autorizado abre um estudo real de teste,
navega por imagens e fecha o estudo sem vazamento de dados entre
sessões.

### P1 --- Visualização 2D de uso diário

Entregas: 1. Window/Level e presets. 2. Zoom, pan, reset, rotação e
inversão. 3. Navegação rápida entre cortes. 4. Layouts de 1/2/4
viewports. 5. Overlay DICOM e orientação. 6. Cine para objetos
compatíveis. 7. Atalhos de teclado. 8. Barra de ferramentas e menus com
aparência própria. 9. Pré-carregamento, cache e liberação de memória.
10. Testes de regressão para as ferramentas principais.

**Critério de aceite:** concluir um fluxo de leitura 2D sem depender do
viewer original para as tarefas cobertas.

### P2 --- Medições, anotações e persistência

Entregas: 1. Comprimento, ângulo, Cobb e ROI/área. 2. Seta, texto e
desenho livre. 3. Lista de medidas e edição. 4. Persistência segura e
versionada. 5. Identificação do autor e data/hora. 6.
Exportação/interoperabilidade apropriada, incluindo DICOM SR se viável.
7. Testes de calibração e geometria.

**Critério de aceite:** as medições sobrevivem ao fechamento e
reabertura do estudo, com unidades corretas e sem duplicação inesperada.

### P3 --- Comparação e produtividade radiológica

Entregas: 1. Abrir séries e estudos lado a lado. 2. Sincronização
manual. 3. Sincronização automática para dados compatíveis. 4. Linhas de
referência e cursor 3D. 5. Hanging protocols. 6. Estudos recentes e
layouts salvos. 7. Preferências por usuário e modalidade.

**Critério de aceite:** um fluxo de comparação atual/anterior funciona
em estudos compatíveis e explica quando não é possível sincronizar.

### P4 --- MPR e visualização 3D

Entregas: 1. Reconstrução MPR ortogonal. 2. MPR oblíqua, se necessária e
suportada. 3. MIP, MinIP e média conforme suporte. 4. Volume rendering e
presets. 5. Sincronização entre viewports. 6. Controle de memória e
performance. 7. Benchmarks com volumes grandes e diferentes GPUs.

**Critério de aceite:** reconstruções espacialmente corretas, navegação
fluida em hardware-alvo e recuperação estável após fechar volumes.

### P5 --- Recursos avançados

Entregas, ordenadas conforme necessidade clínica: 1. Fusão PET/CT e
alinhamento. 2. Curvas TIC. 3. Segmentação e DICOM SEG. 4. RTSTRUCT e
fluxos de radioterapia. 5. DICOM SR avançado. 6. Exportação de modelos
3D. 7. Cine e snapshots avançados de volume. 8. Ferramentas de IA
integradas como módulos independentes.

**Critério de aceite:** cada recurso tem modalidade-alvo definida,
conjunto de dados de validação, limites documentados e testes de
interoperabilidade.

### P6 --- Endurecimento para produção clínica

1.  Matriz de compatibilidade por modalidade, SOP Class e Transfer
    Syntax.
2.  Testes de carga e concorrência.
3.  Testes de segurança, autorização e isolamento entre instituições.
4.  Auditoria de acesso e ações.
5.  Resiliência a falhas do PACS e da rede.
6.  Monitoramento de memória, WebGL, tempos de carregamento e erros.
7.  Política de atualização, rollback e compatibilidade.
8.  Validação clínica documentada.
9.  Revisão regulatória e de privacidade aplicável no Brasil, incluindo
    LGPD e requisitos pertinentes ao uso pretendido.
10. Documentação de operação, suporte, backup e recuperação.

------------------------------------------------------------------------

## 5. Arquitetura de código sugerida

O caminho de menor risco é manter o monorepo OHIF e criar
extensões/modos próprios nele. Uma organização conceitual para o código
personalizado seria:

``` text
OHIF/Viewers/
├── extensions/
│   ├── genus-tools/
│   │   ├── src/
│   │   │   ├── commands/
│   │   │   ├── toolbar/
│   │   │   ├── panels/
│   │   │   ├── measurements/
│   │   │   └── services/
│   ├── genus-comparison/
│   └── genus-workflow/
├── modes/
│   ├── genus-diagnostic/
│   ├── genus-comparison/
│   └── genus-3d/
└── platform/                 # evitar alterações desnecessárias
```

A estrutura real deve seguir os templates e convenções da versão de OHIF
selecionada. Não copie esse exemplo como se fosse uma estrutura oficial
exata.

Para serviços de negócio separados:

``` text
dicom-platform/
├── apps/
│   └── api/                  # Node.js + TypeScript
├── packages/
│   ├── contracts/            # DTOs e contratos
│   └── config/
├── infra/
│   ├── docker/
│   └── nginx/
└── docs/
```

### Separação de responsabilidades

-   **OHIF/Cornerstone:** pixels, viewports, ferramentas de visualização
    e integração de imagem.
-   **API própria:** usuários, permissões, vínculo RIS, preferências,
    auditoria e workflow.
-   **Orthanc:** arquivo DICOM, consulta e recuperação de objetos.
-   **PostgreSQL:** dados transacionais da aplicação; evitar duplicar o
    conteúdo binário do PACS.
-   **Workers opcionais:** processamento assíncrono, geração de previews
    ou pipelines de análise que não devem bloquear a UI.

------------------------------------------------------------------------

## 6. Estratégia de integração com Orthanc

1.  Habilitar e configurar os serviços DICOMweb necessários.
2.  Usar QIDO-RS para busca e listagem quando suportado.
3.  Usar WADO-RS para recuperar estudos, séries, instâncias, metadados e
    pixels.
4.  Usar STOW-RS apenas se o produto precisar enviar objetos ao arquivo.
5.  Configurar proxy reverso para TLS, limites, cabeçalhos e política de
    acesso.
6.  Fazer autorização na camada apropriada; CORS não é mecanismo de
    autenticação.
7.  Garantir que o navegador não receba credenciais administrativas do
    Orthanc.
8.  Avaliar tokens curtos, sessão segura e controle por instituição.
9.  Medir o efeito de latência, compressão, cache e pré-carregamento.
10. Testar interrupções de rede e retomada.

A compatibilidade concreta depende da versão e da configuração do
Orthanc e de seus plugins. Verifique os endpoints e a autenticação na
documentação da instalação usada.

------------------------------------------------------------------------

## 7. Desempenho: requisitos que precisam ser tratados desde o começo

-   Carregar metadados antes de transferir todos os pixels, quando a
    arquitetura permitir.
-   Buscar pixels sob demanda e pré-carregar de forma limitada.
-   Evitar armazenar cópias desnecessárias de imagens em memória.
-   Liberar cache, volumes, renderizadores e listeners ao trocar de
    estudo.
-   Detectar falta de suporte WebGL e exibir erro útil.
-   Testar exames com milhares de imagens, multiframe e séries de grande
    dimensão.
-   Testar redes lentas e sessões concorrentes.
-   Definir limites de memória e comportamento de fallback.
-   Não transferir todos os arquivos de um estudo de uma só vez.
-   Medir tempo até primeira imagem, navegação entre cortes, abertura de
    série e consumo de RAM/VRAM.

Defina uma matriz de teste com navegadores suportados, resolução de
monitor, memória, GPU e modalidades. Não use apenas estudos pequenos de
demonstração como critério de desempenho.

------------------------------------------------------------------------

## 8. Segurança, privacidade e uso clínico

-   Aplicar menor privilégio para usuários e serviços.
-   Validar autorização no servidor para cada estudo, série e operação.
-   Isolar dados por instituição/tenant.
-   Usar TLS e gerenciar segredos fora do frontend.
-   Auditar acessos sem registrar dados sensíveis em excesso.
-   Definir retenção de logs e política de sessão.
-   Evitar URLs públicas permanentes para imagens.
-   Anonimizar estudos de desenvolvimento e teste.
-   Proteger exportação, download, snapshots e links compartilhados.
-   Implementar proteção contra CSRF/XSS e configuração segura de
    cookies conforme o modelo de autenticação.
-   Tratar dados DICOM como dados de saúde sensíveis.
-   Realizar análise de risco, validação clínica e revisão regulatória
    antes do uso diagnóstico.

A escolha de bibliotecas não certifica o produto final. O enquadramento
regulatório depende da finalidade pretendida e do mercado em que será
disponibilizado.

------------------------------------------------------------------------

## 9. Testes de aceitação indispensáveis

Crie um conjunto de exames de teste anonimizados, com resultados
esperados conhecidos, abrangendo:

-   CT axial com espaçamento regular.
-   CT com orientação ou espaçamento não trivial.
-   MR com múltiplas sequências.
-   DX/CR.
-   PET/CT, se houver fusão no escopo.
-   Multiframe.
-   Compressões e transfer syntaxes usadas pelos equipamentos reais.
-   Estudos incompletos e metadados ausentes.
-   Medidas conhecidas para validar unidade e calibração.
-   Séries com geometrias diferentes para testar sincronização.
-   Objetos SR, SEG e RTSTRUCT quando habilitados.
-   Exames muito grandes e condições de rede limitadas.

Automatize testes de interface com Playwright e testes unitários das
regras próprias. Para renderização, compare resultados e geometria com
dados de referência, reconhecendo que pequenas diferenças entre
pipelines gráficos podem ocorrer. A aprovação de uma funcionalidade
clínica deve incluir revisão humana especializada.

------------------------------------------------------------------------

## 10. Riscos e decisões antecipadas

  -----------------------------------------------------------------------
  Risco                               Mitigação
  ----------------------------------- -----------------------------------
  Tentar construir tudo de uma vez    Entregas por fases, com critérios
                                      de aceite

  Alterar profundamente o OHIF        Extensões e modos próprios, patches
                                      mínimos

  Incompatibilidade com codecs        Inventário dos equipamentos e
                                      testes por Transfer Syntax

  Exames grandes travarem o navegador Streaming, cache limitado, limpeza
                                      de recursos e benchmarks

  Medições incorretas                 Validar geometria, calibração,
                                      unidades e resultados

  MPR/fusão espacialmente incorretos  Testes com orientação, espaçamento
                                      e registro conhecidos

  Exposição de dados de saúde         Autorização no servidor, TLS,
                                      auditoria e isolamento

  Paridade prometida sem validação    Matriz de recursos e limitações
                                      publicadas

  Dependência de uma versão           Fixação de versões e plano de
  específica                          atualização upstream
  -----------------------------------------------------------------------

------------------------------------------------------------------------

## 11. Plano de execução recomendado

### Primeira entrega demonstrável

-   OHIF instalado e personalizado com a identidade visual do produto.
-   Orthanc integrado via DICOMweb.
-   Abertura de CT/MR, navegação por cortes, Window/Level, zoom e pan.
-   Deploy reproduzível em Docker/Nginx.
-   Testes com estudos anonimizados.

### Segunda entrega

-   Ferramentas de medição e anotação.
-   Persistência e lista de medidas.
-   Comparação de estudos e layouts.
-   Atalhos e preferências.

### Terceira entrega

-   MPR e volume rendering.
-   Sincronização entre planos e séries.
-   Benchmarks de volumes grandes.

### Quarta entrega

-   Fusão, TIC, segmentação, DICOM SR/SEG/RTSTRUCT e exportações
    conforme demanda.
-   Auditoria, hardening, validação clínica e operacional.

**Regra de priorização:** não iniciar um recurso avançado apenas porque
o RadiAnt o possui. Priorize por necessidade real dos radiologistas,
compatibilidade com os equipamentos, complexidade, risco e capacidade de
validar o resultado.

------------------------------------------------------------------------

## 12. Decisão final

**A opção mais fácil é customizar OHIF v3 e desenvolver extensões
próprias sobre Cornerstone3D.** Use TypeScript/React para a interface e
Node.js/TypeScript para a API de negócio; mantenha Orthanc como PACS e
use DICOMweb para comunicação.

Comece com um visualizador 2D robusto, depois medições, comparação,
MPR/3D e por último recursos especializados. Essa estratégia reduz
retrabalho, permite entregas incrementais e preserva a possibilidade de
acompanhar as atualizações do ecossistema OHIF.

A meta deve ser **paridade funcional progressiva**, não uma cópia
literal do RadiAnt. Reproduza os fluxos e capacidades que seus usuários
precisam, com identidade própria e validação apropriada para uso médico.
