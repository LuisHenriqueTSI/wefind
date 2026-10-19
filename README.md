# WeFIND - Aplicativo Mobile

Aplicativo mobile React Native/Expo do sistema **WeFIND** - Plataforma Comunitária e Inteligente de Animais Perdidos e Encontrados.

## 🌐 Acesso ao WeFIND

Conheça o aplicativo e acesse as instruções completas de instalação pela landing page oficial:

**[Acessar a landing page do WeFIND](https://luishenriquetsi.github.io/wefind/)**

O APK para Android está disponível para download direto na GitHub Release:

**[Baixar o WeFIND v2.0 (.apk)](https://github.com/LuisHenriqueTSI/wefind/releases/download/v2.0/WeFIND_v2.0.apk)**

Para instalar o aplicativo, faça o download pelo celular Android e siga as instruções apresentadas na landing page. Como o APK é distribuído para avaliação do projeto, o Android pode exibir um aviso do Google Play Protect durante a instalação.

### Configuração local e segurança

As credenciais do Supabase e a chave do Google Maps não ficam versionadas neste repositório. Para executar ou gerar uma nova versão do aplicativo, configure-as em um arquivo `.env` local, conforme os exemplos de configuração do projeto.

Antes de distribuir uma nova versão, aplique a migração [`20261008020000_harden_public_data_access.sql`](./supabase/migrations/20261008020000_harden_public_data_access.sql) no SQL Editor do projeto Supabase. Ela remove o acesso anônimo às tabelas de perfis, animais e avistamentos e exige autenticação para consultar avistamentos.

## 🛠️ Correções recentes

* **Rota no mapa para visitantes:** o botão "Ver Rota no Mapa" agora direciona usuários não autenticados diretamente para a tela pública do mapa, evitando o erro de navegação causado pela tentativa de acessar a rota protegida `MainApp`.

## 🎨 Identidade Visual e Design System Oficial (WeFIND)

* **Verde Floresta (Pin Central & Confiança):** `#2E5634` (Cor primária do sistema, cabeçalhos, botões principais, marcadores e destaques).
* **Marrom Caramelo (Cão & Gato):** `#B1734A` (Cor secundária da marca, contrastes e tipografia de marca).
* **Tipografia de Marca Bicolor:** Componente oficial `<WeFindText />` com **We** em Marrom (`#B1734A`) e **Find / FIND** em Verde Floresta (`#2E5634` ou `#FFFFFF` no topo).
* **Nova Logo Oficial:** Imagem oficial em alta definição `assets/logo.png` (ícone, splash e app icon) e `assets/logo_outlined.png` (versão com contorno de silhueta suave para contraste sobre fundo escuro/verde).
* **Tons Pastéis de Suporte:** `#EAF2EB` (verde suave) e `#F8EFE9` (marrom suave).
* **Centralização de Tokens:** `src/constants/theme.js` e `src/contexts/ThemeContext.jsx`.

---

## 🌙 Suporte a Tema Escuro e Aparência (Dark Mode)

* **Provedor Global de Temas (`ThemeContext.jsx`):** Suporte a modo Claro (`light`), modo Escuro (`dark`) e modo Automático/Sistema (`system`).
* **Cards Suaves no Modo Claro:** Cores refinadas para off-white suave (`#F8FAFC`) com bordas delicadas (`#E2E8F0`), evitando o branco estático ofuscante.
* **Cards Imersivos no Modo Escuro:** Paleta em tom ardósia (`#161F30`), bordas suaves (`#243248`) e blocos internos em `#0F172A`.
* **Controle de Aparência nas Configurações:** Seção "Aparência" na tela de Configurações com switch rápido e modal de seleção detalhada.
* **Redefinição Automática para Modo Claro no Logout:** Ao desconectar a conta, o sistema automaticamente redefine as preferências e o estado para o modo claro, garantindo visualização padrão a visitantes.
* **Telas Totalmente Adaptadas ao Tema Escuro:**
  - Tela Inicial (`HomeScreen.jsx`), busca, barra de filtros rápidos e painel de Filtros Avançados em formato Bottom Sheet (`AdvancedFiltersModal.jsx`).
  - Tela de Detalhes do Animal (`ItemDetailScreen.jsx`).
  - Tela de Mensagens e Chat (`InboxScreen.jsx` e `ChatScreen.jsx`).
  - Tela de Minhas Publicações (`MeusAnunciosScreen.jsx`).
  - Fluxo completo de Cadastro/Edição de Animais (`RegisterItemScreen.jsx`).
  - Modal "Compartilhar Cartaz" (`ShareFlyerModal.jsx`).
  - Navegação de Abas Inferiores e Cabeçalhos de Navegação.

---

## 📱 Funcionalidades

✅ **Identidade, Apresentação e Landing Page Minimalista**
- Nova identidade visual completa **WeFIND** com foco universal em **Animais** (cães, gatos, equinos, bovinos, aves e outros).
- Tela de apresentação institucional (**"Sobre o WeFIND"** - `SobreScreen.jsx`) reformulada no estilo *landing page* minimalista com seções em zigue-zague intercaladas:
  - Seção de Divulgação com ilustração vetorial moderna do celular exibindo cartaz com QR Code inteligente.
  - Seção de Comunidade e Alertas com ilustração do pin WeFIND conectando tutores e protetores.
  - O **Mural de Reencontros** exibe somente histórias reais publicadas no banco de dados, sem inserção automática de exemplos (*Mock Data*).
- **Mural de Reencontros (`MuralReencontrosScreen.jsx`):** Tela dedicada com placar comunitário em tempo real dos reencontros do dia atual (`startOfToday`), total acumulado desde o início, histórias/depoimentos enviados por tutores e curtidas da comunidade.
- **Ícone de Navegação do Mapa:** Marcador de localização (`location-on`) na barra inferior alinhado com o símbolo oficial do WeFIND.
- **Ícone do Aplicativo Android (Adaptive Icon):** Configuração refinada no `app.json` apontando para `adaptive-icon.png` com margens de respiro exatas, garantindo centralização impecável e evitando cortes na compilação do APK.
- **Paleta de Cores Padronizada:** 100% alinhada à identidade visual WeFIND (Azul Real `#2563EB`, Verde Sucesso `#10B981`/`#16A34A`, Dourado `#FEA937` e Neutros/Ardósia), sem cores roxas.
- Atalhos diretos para acessar **"Mural de Reencontros"** e **"Sobre o WeFIND"** no menu do perfil e configurações.
- Telas de Login e Cadastro acolhedoras ("Bem-vindo de volta" e "Criar sua conta").

✅ **Motor de Match Inteligente de Pets (`petMatching.js`)**
- Cruzamento automatizado de publicações de animais Perdidos e Encontrados.
- Algoritmo de similaridade calibrado (0 a 100%) com critérios de eliminação estrita (*deal-breakers*: sexo oposto = 0%, portes incompatíveis = 0%, espécies distintas = 0%) e penalidades para cores e idades divergentes.
- Disparo automático de **Push Notifications** e notificações internas no app para matches a partir de 55%.
- Modal de Comparação lado a lado multi-match com carrossel de fotos mini, badges de probabilidade e lista detalhada de correspondências (`PetMatchModal.jsx`).

✅ **Gerador de Cartazes com QR Code & Posts para Redes Sociais (`ShareCardFlyer.jsx` & `ShareFlyerModal.jsx`)**
- **3 Formatos de Divulgação Profissionais:**
  - **Cartaz A4 para Impressão:** Layout de alta resolução para postes, clínicas veterinárias e pet shops com telefone gigante e **QR Code dinâmico** integrado (`https://wefind.app/pet/{id}`).
  - **Instagram Stories & WhatsApp Status (9:16 Vertical):** Arte vertical estilizada para tela cheia com dados para leitura rápida em 3 segundos.
  - **Feed Quadrado (1:1):** Arte compacta otimizada para feed do Instagram/Facebook e encaminhamento em grupos de WhatsApp.
- Seletor de formatos com pré-visualização ao vivo, exportação nativa em imagem PNG e botão para copiar texto com link.

✅ **Cadastro de Animais Tutelados / Carteirinha de Identificação (`PetRgCard.jsx`, `MyPetsScreen.jsx` & `AddEditPetScreen.jsx`)**
- Cadastro de animais tutelados no perfil do tutor com foto, cuidados médicos, vacinas e castração.
- Emissão da **Ficha de Identificação Animal** com visual estruturado (*WeFIND*), dados do tutor e **QR Code de autenticidade**.
- **Acionar Alerta de Desaparecimento "🚨 MEU PET FUGIU!":** Converte instantaneamente os dados do animal tutelado em uma publicação de animal perdido no mapa, notifica os voluntários da região e executa o motor de match inteligente.

✅ **Gamificação & Selos de Guardião da Comunidade (`gamification.js` & `GamificationCard.jsx`)**
- **5 Níveis de Guardião:** *Amigo dos Animais 🐾*, *Protetor Local 🛡️*, *Olhos Atentos 👁️*, *Anjo da Guarda 👼* e *Guardião Lendário WeFIND 👑*.
- Pontuação dinâmica de Impacto (XP) por Reencontros (+250 XP), Lares Temporários (+120 XP), Publicações (+40 XP), RG Pet (+35 XP) e Divulgações (+20 XP).
- 7 Medalhas e Conquistas (*Badges*) desbloqueáveis exibidas com barra de progresso no perfil do usuário e no perfil público de outros membros.

✅ **Central de Notificações no Estilo TikTok (`NotificationsScreen.jsx`)**
- **Abas Segmentadas:** Organização em abas `Comunidade` (mensagens e conversas de pets com badge contador) e `Sistema (X)` (alertas de proximidade, avistamentos e renovações).
- **Banner Informativo Retrátil:** Aviso discreto *"Notificações e alertas ficam salvos por 30 dias"* com fechamento `×`.
- **Filtro Dropdown / Bottom Sheet:** Seleção rápida para filtrar por *Todas*, *Não lidas*, *Alertas de Proximidade*, *Avistamentos* ou *Lembretes de Renovação*.
- **Agrupamento Temporal:** Divisão dinâmica entre `⚡ Notificações importantes` (recentes/não lidas) e `Mais antigas`.
- **Cards TikTok:** Ícones circulares limpos, títulos com prefixos em negrito, tempo relativo compacto (`2m`, `3h`, `1d`) e ponto indicador vermelho de não lido `🔴`.
- **Ações Rápidas & Segurança:** Marcar todas como lidas via botão de cabeçalho `done-all` e gerador de notificações demo restrito à conta de Administrador (`isAdmin`).
- **Sino da Home Conectado:** O botão de sino no topo da tela inicial abre diretamente a central completa de notificações.

✅ **Autenticação, Notificações e Segurança por WhatsApp**
- Registro e login direto e simplificado com nome, email, WhatsApp e senha.
- **Verificação em 2 etapas por WhatsApp:** Envio do código de 6 dígitos via Evolution API / Supabase Functions, com interface de entrada otimizada em blocos visuais individuais (6 quadrados tipo OTP), opção de reenvio com timer de recarga e edição rápida de dados.
- **Redefinição de Senha e Alteração de WhatsApp com Código:**
  - Redefinição de senha diretamente pelo perfil através do fluxo oficial de WhatsApp (`EsqueciSenhaScreen.jsx`).
  - Validação obrigatória por código de 6 dígitos no WhatsApp ao atualizar o número de telefone no perfil.
- **Notificações de Busca e Feed Inteligente:** Lembretes automáticos a cada 2 dias perguntando se o animal foi encontrado; respostas "Ainda não" impulsionam automaticamente a publicação para o topo do feed (`created_at`).
- **Notificações e Alertas por WhatsApp:** Caixa de consentimento no cadastro (`whatsapp_notifications_enabled`), controle de preferências na tela de configurações (`ConfigScreen.jsx`), botão de disparo de teste instantâneo e alertas em tempo real para os tutores sobre **novas informações de animais** via Evolution API.
- **Perfil do Usuário Humanizado e Sem Blocos Artificiais:**
  - Identidade visual limpa, botão em linha para edição de dados e agrupamentos nativos de menu (Comunidade, Conta & Preferências).

✅ **Localização Inteligente, Endereço Completo e Raio de Busca Personalizável**
- **Sincronização Bidirecional de Localização:**
  - Definição pelo cabeçalho da Tela Inicial ou pela tela de Editar Perfil com persistência local (`AsyncStorage`) e no Supabase (`profiles`).
- **Endereço Completo e Detalhado:**
  - Geolocalização reversa automática capturando Rua, Número, Bairro, Cidade, Estado e CEP com suporte a edição manual.
  - Cabeçalho compacto (`Rua, Cidade, UF • <raio> km`) que preserva o layout sem empurrar a foto de perfil.
- **Raio de Busca Personalizável (15 km a 250 km):**
  - Seletores interativos de distância rápida (**15 km**, **30 km**, **60 km**, **100 km**, **150 km**, **250 km**).
  - Visualização em tempo real do **círculo de alcance** no mapa (`MapLocationPicker.native.jsx`).
- Ao entrar, o feed filtra automaticamente as publicações pelo ponto GPS marcado e pelo raio selecionado, com opção de resetar para **Todo o Brasil**.
- Cabeçalho dinâmico da tela de feed: centralizado no modo visitante ("Explorar") e alinhado à esquerda com avatar/notificações quando autenticado ("Início").
- Perfis de usuário com foto de avatar, fallback elegante com inicial do nome e edição de localidade opcional.

✅ **Animais Perdidos, Encontrados e Adoção Responsável**
- **Nomenclatura Universal de Animais:** Plataforma expandida para todo tipo de animal (cães, gatos, bovinos, cavalos, aves e outros).
- **Custódia de Animais Encontrados:** Opção clara para indicar se o animal foi **"Apenas visto na rua"** (sem recolhimento) ou se **"Está comigo (Lar Temporário)"**.
- **Sistema de Adoção Responsável e Janela de Busca:**
  - Animais resgatados acolhidos contam com janela de 21 dias de busca pelo tutor original. Após esse período, o responsável recebe uma notificação para decidir entre continuar com o animal ou disponibilizá-lo para adoção responsável.
  - Suporte a **Adoção Direta** imediata para animais de abrigo ou ninhadas sem dono prévio.
  - Filtro dedicado **"Para Adoção"** no topo do feed com contadores e badges coloridos.
- **Design Minimalista de Atributos com Emojis:**
  - Espécie, raça, sexo, idade, porte e cor organizados em badges minimalistas diretamente abaixo da foto do animal (`🐾`, `🏷️`, `⚧`, `🎂`, `📏`, `🎨`).
- **Cartazes de Compartilhamento Dinâmicos ("Compartilhar Cartaz" - `ShareCardFlyer.jsx` & `ShareFlyerModal.jsx`):**
  - Geração de flyer em imagem de alta definição com cores e temas inteligentes (Vermelho para Perdido, Verde para Encontrado, Rosa/Magenta `#DB2777` para Adoção).
  - Badges de características com emojis e chamada de compartilhamento personalizada.
- **Card de Localização em Largura Total com Data Integrada:**
  - Indicação em linha `"Data em que perdi: DD/MM/AAAA"` ou `"Data em que encontrei: DD/MM/AAAA"`.
- **Avatar e Foto do Autor em "Publicado por" e Avistamentos:**
  - Exibição da foto atualizada do perfil ou avatar circular colorido com a letra inicial do nome do usuário.
- **Padronização do Botão de Retorno:**
  - Botão voltar com moldura circular translúcida e ícone `chevron-left` padronizado na tela de Detalhes do Animal e em toda a pilha de navegação.
- Adição de até 6 fotos com enquadramento/corte nativo e botão "✂️ Ajustar" por miniatura.
- Carrossel interativo de fotos nos cards do feed (`HomeScreen`) e modal em tela cheia nos detalhes (`ItemDetailScreen`).
- **Placar Comunitário WeFIND:** Hero Card com contador dinâmico de animais reencontrados hoje, total acumulado desde o início e avatares sobrepostos.
- **Histórias de Reencontro em Destaque:** Carrossel de relatos enviados por tutores com foto, avaliação por estrelas, depoimentos e moderação/exclusão pelo administrador.
- **Tela Dedicada de Animais Reencontrados (`RecoveredPetsScreen.jsx`):** Mural de animais que voltaram para casa com cálculo do tempo até o reencontro, busca e filtros por espécie.
- Recompensas opcionais e gamificação.

✅ **Modo Público e Mapa Interativo para Visitantes**
- **Barra de Pesquisa de Animais no Mapa:** Busca em tempo real por nome, raça, espécie ou cidade diretamente no topo do mapa, com filtragem instantânea dos marcadores e recentralização automática.
- **Exploração Livre do Mapa:** Visitantes não autenticados podem navegar pelo mapa, consultar cards de animais, ver detalhes e ler comentários livremente com visualização limpa e moderna.
- **Mensagens Diretas sem Bloqueios:** Chat direto e instantâneo com o autor da publicação.
- **Identificação Visual por Cores:**
  - 🟠 **Laranja (`#F97316`):** Animal Perdido
  - 🟢 **Verde (`#16A34A`):** Animal Encontrado
  - 💖 **Rosa (`#DB2777`):** Animal Disponível para Adoção
- Centralização rápida na localização atual do usuário via GPS.
- Barra inferior com Safe Insets prevenindo sobreposição de botões de navegação do sistema Android.
- **Localização de Visitante Temporária ("Todo o Brasil" padrão):**
  - Usuários não autenticados sempre iniciam com "Todo o Brasil" (sem restrição geográfica).
  - Qualquer seleção de cidade/ponto no mapa é aplicada apenas temporariamente na sessão atual.
  - Ao trocar de aba ou navegar para outra tela, a localização volta automaticamente para "Todo o Brasil".
  - Para usuários autenticados, a localização é persistida permanentemente no perfil e no dispositivo.

✅ **Avistamentos Vivos & Traçado de Rota GPS nos Comentários (`ItemDetailScreen.jsx` & `sightings.js`)**
- **Atualização Atômica de Localização:** Quando um membro da comunidade relata ter visto o animal via modal *"Vi esse pet"*, o sistema atualiza em tempo real a latitude, longitude e endereço completo na tabela `items` e credita +40 XP de gamificação.
- **Endereço Clicável com Traçado de Rota Direto:** Cada comentário e pista deixada pela comunidade que possuir localização torna-se um botão interativo (`🧭 LOCAL INFORMADO • TOQUE PARA VER A ROTA ➔`). Ao ser clicado, abre instantaneamente o mapa do app calculando e desenhando o trajeto GPS em tempo real entre o usuário e o local do avistamento.
- **Marco Zero com Zoom de Rua:** O botão de aproximação no seletor de mapa (`MapLocationPicker.native.jsx`) e no mapa principal (`MapScreen.native.jsx`) utiliza zoom focado (`zoom: 16.5` e `delta: 0.006`), com posicionamento dinâmico responsivo (`cardHeight + 36px`) prevenindo qualquer sobreposição com o card do animal.
- **Tipografia Moderna e Proporção do Cabeçalho (`HomeScreen.jsx`):** Símbolo oficial ampliado para 34x34 e tipografia WeFIND ajustada para visual leve, arejado e elegante (fontSize 20, pesos 300/600 e tracking 1.4).

---

✅ **Feed Inteligente — Performance, Ordenação e Consistência**
- **Carregamento Instantâneo com Cache (Stale-While-Revalidate):**
  - Dados do cache local aparecem imediatamente ao abrir o app; o servidor atualiza silenciosamente em background.
  - O cache é pré-validado para remover itens expirados ou resolvidos antes de renderizar.
- **Eliminação do Flickering/Pulo de Publicações:**
  - `filteredItems` convertido para `useMemo` determinístico — produz exatamente **um render atômico** por mudança de dados, sem competição entre cache e servidor.
  - Removidos todos os `useEffect` redundantes e chamadas paralelas a `applyFilters` que causavam a troca visual de publicações.
- **Ordenação Estrita por Proximidade (Crescente):**
  - Animais mais próximos do usuário sempre no topo (ex: 350 m → 1.2 km → 4.5 km → 18 km).
  - Desempate por data mais recente (`created_at` decrescente).
  - Qualquer mudança de localização ou raio recalcula a lista imediatamente.
- **Eliminação de Publicações Fantasmas:**
  - Função `shouldHideItem` corrigida para calcular expiração a partir de `created_at` (janela de 7 dias), mesmo sem campo `expires_at` explícito.
  - Queries do Supabase filtram `resolved: false` por padrão em todas as buscas públicas.
  - Cache e estado local são sanitizados instantaneamente ao excluir ou resolver um anúncio.
- **Query Única Otimizada com Joins:**
  - `listItemsWithPhotosAndOwner` busca itens, perfis, fotos e recompensas em **1 único roundtrip de rede**.
- **Renderização Nativa e Virtualização:**
  - `ItemCard` com `React.memo`, FlatList com `windowSize`, `removeClippedSubviews` e decodificação multithread de imagens.

---

## 🧭 Arquitetura de Avistamentos em Tempo Real & Rastro de Deslocamento (TCC)

O sistema WeFIND implementa uma arquitetura inédita de **"Rede Viva de Avistamentos Comunitários"** (*Sighting Trail & Live Pin Tracking*), desenhada especificamente para solucionar dois desafios fundamentais do resgate animal urbano:

```
                  ┌──────────────────────────────────────────────────────────┐
                  │          NOVO USUÁRIO AVISTA ANIMAL NA RUA               │
                  └─────────────────────────────┬────────────────────────────┘
                                                │
                 ┌──────────────────────────────┴────────────────────────────┐
                 ▼                                                           ▼
       [Opção A: No Mapa Interativo]                             [Opção B: No Cadastro do App]
       • Toca em "Vi o Pet Aqui" no Card                         • Seleciona "Visto na rua (não fiquei)"
       • Dispara captura instantânea de GPS                      • Informa espécie e localização GPS
                 │                                                           │
                 │                                                           ▼
                 │                                       [Motor de Correspondência Geodésica]
                 │                                       • Busca ativa em raio de 5 km (Haversine)
                 │                                       • Validação de espécie e temporalidade
                 │                                                           │
                 │                              ┌────────────────────────────┴──────────────────────────┐
                 │                              ▼                                                       ▼
                 │                    [Sem correspondência]                                  [Encontrado Pet Similar!]
                 │                    • Prossegue com novo cadastro                          • Abre Modal com Fotos & Distância
                 │                              │                                            • "Sim, é este pet!" ────────┐
                 │                              ▼                                                       │                 │
                 │                    [Cria Novo Pin no Mapa]                                           │                 │
                 │                                                                                      │                 │
                 └──────────────────────────────────────┬───────────────────────────────────────────────┘                 │
                                                        ▼                                                                 ▼
                                        [Execução da Atualização Atômica]                                   [Notificação Instantânea]
                                        1. Insere histórico em `item_sightings`                              • Dispara alerta ao tutor
                                        2. Atualiza coordenadas vivas em `items`                             • Alerta voluntários da área
                                        3. Move o marcador GPS no mapa para o ponto atual
                                        4. Atualiza a Rota de Navegação até o animal
```

---

### 1. 🧮 Fundamentação Matemática: Fórmula de Haversine
Para determinar a distância ortodrômica (em linha reta sobre a superfície esférica da Terra) entre a localização atual do usuário e as coordenadas dos animais registrados na base de dados, utilizamos a **Fórmula de Haversine**:

$$\Delta\sigma = 2 \cdot \arcsin\left( \sqrt{ \sin^2\left(\frac{\Delta\phi}{2}\right) + \cos(\phi_1) \cdot \cos(\phi_2) \cdot \sin^2\left(\frac{\Delta\lambda}{2}\right) } \right)$$

$$d = R \cdot \Delta\sigma$$

Onde:
* $\phi_1, \phi_2$: Latitude do ponto 1 e ponto 2 em radianos.
* $\Delta\phi = \phi_2 - \phi_1$: Diferença de latitudes.
* $\Delta\lambda = \lambda_2 - \lambda_1$: Diferença de longitudes.
* $R = 6.371\text{ km}$: Raio médio volumétrico da Terra.
* $d$: Distância geodésica resultante em quilômetros.

No código-fonte, a função está implementada de forma otimizada em `src/services/sightings.js`:
```javascript
export const calculateDistanceKm = (lat1, lon1, lat2, lon2) => {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
  const R = 6371; // km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};
```

---

### 2. 🛡️ Segurança e Privacidade: Segregação de Custódia (`spotted` vs `with_me`)
Para garantir a integridade física e a privacidade dos membros da comunidade:
1. **Animais Vistos na Rua (`found_custody === 'spotted'` e `status === 'lost'`):**
   - São os **únicos** exibidos publicamente nos pins do mapa.
   - O objetivo é mobilizar a comunidade para o resgate imediato de animais em situação de vulnerabilidade e deslocamento.
2. **Animais Acolhidos em Lar Temporário (`found_custody === 'with_me'`):**
   - O endereço residencial do voluntário **não é plotado no mapa público**.
   - O responsável pode exigir comprovação de tutela antes de liberar o chat (opção ativada por padrão) ou permitir a conversa sem comprovantes. Em ambos os casos, o endereço residencial continua protegido; a devolução deve ser combinada em um ponto público seguro.

---

### 3. 🔍 Detecção Inteligente de Duplicidade no Cadastro (`RegisterItemScreen.jsx`)
Quando um usuário encontra um animal na rua e inicia o cadastro:
1. Ao definir a espécie e selecionar a localização GPS, o sistema invoca silenciosamente `findNearbyPotentialMatches(...)`.
2. Se houver registros de animais perdidos ou vistos na mesma área em um raio de até **5 km**, o modal interativo `NearbyMatchingModal` é exibido.
3. Se o usuário confirmar (*"Sim, é este pet!"*):
   - O sistema cria o registro de avistamento com a nova foto tirada.
   - A localização do pin no mapa do animal existente é movida **automaticamente** para as novas coordenadas.
   - O tutor e voluntários são notificados imediatamente sobre a nova posição do pet.
4. Se o usuário recusar (*"Não, é outro animal"*):
   - O fluxo prossegue e cria uma publicação inédita sem atrito.

---

### 4. 🚗 Rota GPS e Navegação Dinâmica até o Último Avistamento (`MapScreen.native.jsx`)
* **Cálculo de Trajeto OSRM (Open Source Routing Machine):** Rota traçada dinamicamente entre a posição em tempo real do voluntário/tutor e as coordenadas mais recentes do animal.
* **HUD de Navegação Ativa:** Exibição da distância em quilômetros, tempo estimado de chegada e botão para navegação assistida por GPS.

---

### 5. ❤️ Histórias reais e curtidas do Mural de Reencontros

* **Sem histórias fictícias:** o carrossel não utiliza mais histórias de demonstração. Quando não existem relatos publicados, o mural informa que ainda não há histórias disponíveis.
* **Login obrigatório:** visitantes podem visualizar as histórias, mas precisam entrar na conta para curtir.
* **Curtir e descurtir:** o mesmo botão alterna entre `favorite-border` e `favorite`, permitindo adicionar ou remover a curtida.
* **Uma curtida por usuário:** a tabela `success_story_likes` possui uma restrição única para o par `story_id + user_id`, evitando duplicidades.
* **Persistência no Supabase:** a quantidade de curtidas e o estado da curtida do usuário são carregados ao abrir ou atualizar o mural.
* **Proteção por RLS:** qualquer pessoa pode consultar as curtidas; somente usuários autenticados podem inserir e remover a própria curtida.
* **Histórias locais:** histórias armazenadas apenas no dispositivo não recebem curtidas até serem persistidas no Supabase.
* **Migração:** execute [`supabase/success_story_likes.sql`](supabase/success_story_likes.sql) no SQL Editor do Supabase antes de utilizar o recurso em produção.

### 6. 🛡️ Arquitetura de Privacidade e Segurança do Tutor (Privacy by Design - LGPD)

Um dos pilares acadêmicos e operacionais mais críticos do **WeFIND** é a proteção integral da integridade física, psicológica e patrimonial dos tutores em momentos de vulnerabilidade:

```
                      [ CADASTRO DE ANIMAL PERDIDO ]
                                     │
               ┌─────────────────────┴─────────────────────┐
               ▼                                           ▼
   [ O que o Sistema Utiliza ]                [ O que o Público Visualiza ]
   • Coordenada GPS (Epicentro)               • Apenas Bairro e Cidade
   • Algoritmo de Haversine (Raio de Alerta)  • Ponto de Referência Opcional
   • Disparo para Voluntários Próximos        • NUNCA o número da casa do tutor
```

#### 📌 Princípios Implementados:
1. **Desacoplamento do Endereço Residencial (*Anti-Scam* / Prevenção a Extorsões):**
   - Ao cadastrar que perdeu um animal, o tutor **NÃO** deve e **NÃO** é solicitado a informar o número de sua residência.
   - Isso elimina fraudes comuns onde golpistas usam o endereço da vítima para fingir sequestro/resgate com exigência de transferências bancárias (Pix).
2. **Conceito de Epicentro Geográfico de Busca:**
   - A coordenada registrada funciona como o **centro do círculo de busca**.
   - O algoritmo geoespacial do WeFIND calcula a proximidade e envia notificações automáticas em lote para voluntários e lares temporários situados num raio de **5 km a 10 km** do ponto de desaparecimento.
3. **Diferenciação Contextual de Localização por Tipo de Publicação:**
   - **Animal Perdido (`status === 'lost'`):** O público visualiza apenas o bairro e referências gerais (*ex: "Região do Centro • Proximidades da Praça Tochetto"*).
   - **Animal Visto na Rua (`found_custody === 'spotted'`):** O endereço do logradouro público fica visível (*ex: "Av. Brasil, 450 - Centro"*), permitindo que a comunidade e o tutor tracem rotas de resgate imediatas.
   - **Animal Acolhido ou para Adoção:** O endereço residencial e o número da casa permanecem ocultos em detalhes, cartões e mensagens de compartilhamento. A comprovação de posse pode autorizar a conversa, mas não revela o endereço; a devolução é combinada em um ponto público seguro.

---

### 7. 🔔 Sistema de Push Notifications e Alertas Comunitários por Proximidade (Expo + Supabase)

O **WeFIND** implementa uma arquitetura completa de notificações móveis push em tempo real utilizando o ecossistema oficial do **Expo (`expo-notifications`)** integrado ao banco de dados Supabase e à fórmula geodésica de Haversine:

```
               [ TUTOR CADASTRA ANIMAL PERDIDO ]
                               │
               ┌───────────────┴───────────────┐
               ▼                               ▼
       [ Supabase DB ]             [ Algoritmo Geoespacial ]
   Registra o Pet Perdido         Calcula Raio de Proximidade (15 km)
               │                               │
               └───────────────┬───────────────┘
                               ▼
            [ Identifica Moradores e Voluntários ]
            (Filtra por Coordenadas / Cidade)
                               │
       ┌───────────────────────┼───────────────────────┐
       ▼                       ▼                       ▼
[ Push Notification ]   [ In-App Notification ]   [ WhatsApp Alert ]
  Expo Push Service       Caixa de Entrada          Disparo Opcional
(Notificação Celular)   (Tela de Notificações)    (Com Consentimento)
```

#### 📌 Como Funciona o Ciclo de Vida Push no Expo:
1. **Registro Automático de Token Push (`pushNotifications.js` / `AuthContext.jsx`):**
   - Ao inicializar a sessão do usuário ou realizar login, o aplicativo solicita permissão e obtém o `ExpoPushToken` (`ExponentPushToken[...]`).
   - O token é automaticamente sincronizado com a tabela `profiles` no Supabase e no `AsyncStorage`.
   - No Android, é provisionado o canal de alta importância com som, vibração e banner `wefind-lost-pets`.
2. **Disparo Geodistribuído em Tempo Real (`broadcastLostPetAlertToNearbyUsers`):**
   - No momento em que um animal é cadastrado com `status === 'lost'`, o sistema calcula a distância de todos os usuários registrados até o epicentro do desaparecimento.
   - Os usuários e voluntários que residem no raio de alerta (até **15 km**) recebem:
     - **Push Notification com Banner Sonoro no Celular:** `🚨 Alerta de Pet Perdido na sua Região! Um [Pet] foi perdido no [Bairro]. Fique atento e avise caso o veja!`
     - **Notificação In-App Persistente:** Registrada na tabela `notifications` com o tipo `nearby_lost_pet`.
     - **Alerta WhatsApp (Opcional):** Disparado caso o voluntário tenha ativado notificações externas.
3. **Deep Linking e Navegação Automática ao Tocar na Notificação (`App.js`):**
   - O ouvinte global `Notifications.addNotificationResponseReceivedListener` intercepta o toque do usuário na notificação da barra do Android/iOS e abre instantaneamente a tela de detalhes do pet perdido ([`ItemDetailScreen.jsx`](file:///c:/Users/luish/OneDrive/Documentos/GitHub/tcc_recover_aplicativo/mobile/src/screens/ItemDetailScreen.jsx)).

---

✅ **Segurança — Validação Estrita de Senhas e Mensagens Amigáveis**
- **Validação Rigorosa de Senhas Fortes (`RegisterScreen.jsx` & `EsqueciSenhaScreen.jsx`):**
  - Exigência simultânea e estrita de no mínimo 8 caracteres, letras maiúsculas (`A-Z`), minúsculas (`a-z`) e números (`0-9`) tanto no cadastro quanto na redefinição via WhatsApp.
- **Medidor Visual de Força de Senha (`PasswordStrengthIndicator.jsx`):**
  - Barra de progresso colorida em tempo real com nível: Fraca / Média / Forte / Excelente.
  - Checklist de requisitos com ícones: mínimo 8 caracteres, maiúscula, minúscula e número.
- **Tradução Amigável de Erros de Autenticação (`src/utils/authErrors.js`):**
  - Credenciais incorretas, usuário não encontrado, e-mail não confirmado, conta já existente, senha fraca, rate limit e erros de rede — todos com mensagens claras e humanizadas em português.

---

## 🚀 Setup e Execução

### 1. **Instalar Dependências**
```bash
npm install
```

### 2. **Configurar Variáveis de Ambiente**
Copie `.env.example` para `.env`:
```bash
cp .env.example .env
```

Edite `.env` e adicione suas credenciais Supabase e IA:
```env
EXPO_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=sua_chave_anonima
```

---

### 💻 3. **Modos de Execução e Demonstração do Aplicativo**

#### 🔹 Opção A: Desenvolvimento Local no PC (Fast Refresh em Tempo Real)
Use no dia a dia enquanto programa no computador:
```bash
npx expo start
```
* **Na mesma rede Wi-Fi:** Escaneie o QR Code no app **Expo Go** do Android/iOS.
* **Em redes diferentes (ou 4G):**
  ```bash
  npx expo start --tunnel
  ```
  *(Qualquer alteração feita no código atualiza instantaneamente no celular em 1 segundo).*

---

#### ☁️ 🔹 Opção B: Publicar na Nuvem (Abrir no Celular com o PC Desligado)
Use para demonstrar o app fora de casa, em reuniões ou quando o computador estiver desligado:

1. **Fazer login no Expo (uma única vez):**
   ```bash
   npx expo login
   ```
   *(Conta configurada: `luishenriquetsi`)*

2. **Publicar/Atualizar a versão na nuvem:**
   ```bash
   npx eas-cli update --auto --platform android
   ```

3. **Como abrir no celular (sem precisar do PC ligado):**
   * Abra o aplicativo **Expo Go** no celular.
   * Conecte-se com sua conta Expo (`luishenriquetsi`).
   * Vá na aba **Projects** (ou **Home**) e toque em **`wefind-app`** (`@luishenriquetsi/wefind-app`).
   * O aplicativo vai abrir diretamente dos servidores do Expo, 100% autônomo e funcional.

---

#### 📦 🔹 Opção C: Gerar o Instalador Android (.APK) Standalone
Gera um arquivo instalável `.apk` (sem depender do Expo Go) para instalar em qualquer Android, enviar no WhatsApp ou apresentar na banca:

1. **Gerar a compilação do APK na nuvem do Expo:**
   ```bash
   npm run build:apk
   ```
   Antes da compilação, o comando incrementa automaticamente a versão patch do aplicativo em `app.json` (por exemplo, `2.8.0` para `2.8.1`). Para compilar localmente, use `npm run build:apk:local`; ele também incrementa a versão antes de compilar.

2. **Como baixar e instalar:**
   * O terminal exibirá um link do EAS Build (e um QR Code).
   * Abra o link no celular ou no computador para baixar o arquivo `.apk` final.
   * Transfira para o celular (ou baixe direto) e toque para instalar!
   * *Nota:* Todas as variáveis de ambiente (`.env`) já estão configuradas no `eas.json` e serão embutidas automaticamente no APK.

---

### 4. **Rodar no Navegador (Web)**
```bash
npm start
# Pressione 'w' no terminal para abrir no navegador
```

---

## 📁 Estrutura do Projeto

```
mobile/
├── assets/                   # Ícones e splash do app
├── src/
│   ├── assets/               # Logos do WeFIND em alta definição
│   ├── components/           # Componentes reutilizáveis (Button, Card, Input, Modais)
│   ├── constants/            # Design system (theme.js)
│   ├── contexts/             # Context API (AuthContext)
│   ├── lib/                  # Configurações (supabase, br-locations)
│   ├── navigation/           # Navegação do App (Stacks e Bottom Tabs)
│   ├── screens/              # Telas do aplicativo
│   └── services/             # Serviços e APIs (Supabase, Auth, Items, IA)
```

## 📐 Documentação do domínio

Os diagramas de classes conceituais do WeFIND estão disponíveis em
[`docs/DIAGRAMA_CLASSES_CONCEITUAL.md`](docs/DIAGRAMA_CLASSES_CONCEITUAL.md).
A versão resumida mantém apenas os conceitos, atributos essenciais,
relacionamentos e cardinalidades do domínio, sem detalhes de implementação.

Para habilitar o controle persistente de conversas (`ativa`/`encerrada`),
execute o script [`supabase/conversations.sql`](supabase/conversations.sql) no
projeto Supabase.