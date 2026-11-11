# Simulador de Logística SENAI

Laboratório de equipamentos 3D com oito setores, operação interativa, automática e manual. Escolha entre panela de cabo 18 cm, caçarola 24 cm e frigideira 24 cm no painel à direita. O modelo acompanha cada unidade até a expedição e aparece no relatório. Trocar o modelo prepara um novo lote.

## Executar

Requer Node.js 24 ou superior. Instale com `npm install` e execute `npm run dev`. O comando inicia a API de autenticação na porta 3001 e o Vite em http://127.0.0.1:5173. Abra **esse endereço**, crie uma conta e entre. Não use um servidor de arquivos estáticos isolado: o login precisa da API.

Para executar separadamente: `npm run dev:api` e `npm run dev:client`. Se a porta 5173 estiver ocupada, encerre a instância anterior: uma porta alternativa também exige atualizar APP_ORIGIN. O proxy Vite envia /api para a API local preservando a origem.

## GitHub Pages — demonstração pública

A demonstração estática abre diretamente no simulador, sem cadastro, login, recuperação de senha ou chamadas à API. Ela não grava contas de alunos nem representa autenticação. O modo normal (`npm run dev` / `npm run build`) continua usando o servidor com JWT.

`npm run build:pages` gera os arquivos públicos em `dist-pages`, com os caminhos preparados para `/Logistica/`. Para conferir localmente, execute `npm run preview:pages` e abra `http://127.0.0.1:4173/Logistica/`.

Em **Settings → Pages → Build and deployment → Source**, selecione **GitHub Actions**. O fluxo `.github/workflows/pages.yml` testa, compila e publica a demonstração a cada envio para `main`, ou manualmente pela aba Actions. Endereço: `https://vinlkd.github.io/Logistica/`.

Somente `dist-pages` é publicado. Banco SQLite, arquivos privados, código do servidor e configurações de e-mail ficam fora do site. Ao renomear o repositório, o fluxo usa o caminho informado pelo GitHub Pages automaticamente.

## Autenticação e recuperação

Cadastro, login e saída funcionam com JWT assinado via jose em cookie HttpOnly, senha com scrypt e contas em SQLite. O login é verificado antes de abrir o simulador. A troca de senha invalida sessões anteriores. Os dados privados ficam em `.local/auth`, fora do Git e da pasta pública.

Para enviar e-mails, copie `.env.example` para `.env` e configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD e SMTP_FROM. Reinicie o servidor. Sem SMTP, **somente em desenvolvimento**, os e-mails de recuperação são salvos como arquivos `.eml` em `.local/auth/mail`; abra o arquivo mais recente e use seu link. Nenhum e-mail real é enviado nesse modo. Os links expiram em 20 minutos e funcionam uma vez.

Em produção, é necessário um serviço Node persistente, HTTPS e proxy de `/api` no mesmo domínio da página. Configure NODE_ENV=production, APP_ORIGIN, AUTH_JWT_SECRET aleatório de pelo menos 32 bytes e SMTP real. `npm run build` gera os arquivos do cliente em dist; `npm start` inicia apenas a API. Consulte [server/README.md](server/README.md) para configuração e limites. O cadastro ainda não verifica a posse do e-mail.

## Conduzir a simulação

O modo Automático é o padrão. Após escolher Panelas, o simulador abre no Recebimento; clique em Iniciar para começar o ciclo. O modo Interativo continua disponível: nele, use o botão da cena ou do painel para autorizar uma operação por vez. A máquina termina essa operação e espera o próximo comando. Na linha integrada em modo Interativo, passe pelos setores para liberar as operações quando receberem material. A montagem de cabo/alças faz parte da produção. Sensores, proteção, obstrução e emergência afetam o ciclo. Não há conexão com CLP externo nesta versão.

## Verificar

`npm test` verifica autenticação, recuperação, segurança, modelos e fluxo de materiais. `npm run build` valida a versão de distribuição.

### Cadastro de alunos e tentativas

Novos cadastros exigem matrícula única (3–30 letras, números ou hífens), preservando zeros à esquerda. O login continua com e-mail e senha. Contas anteriores são preservadas pela migração do banco. A senha mínima no cadastro e na recuperação é de 8 caracteres (máximo 128). A matrícula informada não é consultada em uma base oficial do SENAI.

O servidor limita tentativas de login, cadastro e recuperação, além do total por origem de conexão. Ao receber HTTP 429, o formulário aguarda o prazo `Retry-After` e mostra a contagem para tentar novamente. Os limites são aplicados no servidor mesmo se o formulário for contornado. Veja server/README.md para os valores e limites operacionais.

### Cinemática e passagens

A altura das peças usa a superfície de apoio e o fundo real da geometria. Na prensa, matriz e punção seguem a conformação, depois a peça é ejetada ao nível dos roletes antes da montagem de cabo/alças. Todas as panelas ficam giradas 90° e os roletes giram pelo deslocamento da peça. A embalagem é dimensionada pelo envelope do modelo, incluindo os cabos, com folga interna e cabeçote recolhido durante o transporte. A estrutura da embalagem deixa livres as entradas e saídas, inclusive para as abas abertas.

Estoque usa garfos: elevar, guardar no endereço, recuar, recolher e descer. A caixa passa a repousar nos apoios da prateleira enquanto os garfos recuam. O estoque final exibe somente caixas. A expedição preenche os endereços mais profundos primeiro, com plataforma de doca e três níveis de apoio no caminhão.

Colisores da estrutura verificam o volume varrido pela peça entre quadros e bloqueiam o movimento se a passagem não estiver livre. Ferramentas seguem percursos de contato e recolhimento definidos para os modelos. Os testes verificam apoio, continuidade dos trajetos, folga de caixas/cabos, ferramentas e carregamento sem sobreposição. A câmera inicial fica centralizada e elevada na frente da bancada; as docas usam a mesma orientação com enquadramento ampliado.

## Escolha de ambientes

A página inicial abre diretamente, sem login, com duas opções: **Panelas** e **Fábrica de bebidas**. **Escolher ambiente** retorna à seleção e libera a cena anterior. As prévias 3D usam os modelos reais e aparecem ao passar o mouse, focar pelo teclado ou acessar pelo toque. Links antigos de móveis e encomendas retornam à escolha de ambientes; seus dados salvos não são apagados.

Em bebidas, **Interativo** espera autorização a cada operação e **Automático** encadeia as etapas. Ajuste os parâmetros antes de liberar a máquina. Pausar preserva a posição; a emergência exige rearmar e iniciar novamente. A linha reutiliza a interface, o piso, a esteira, a iluminação e as câmeras das panelas. **Bancada individual** permite treinar uma etapa, e **Linha integrada** conduz o fluxo completo. **Manual** permite comandar transporte, processo e transferência.

Bebidas inclui recebimento por caminhão, lavagem interna por lança com garra, envase com nível visível, tampagem, aplicação física de rótulo impresso, encaixotamento por garra, fechamento com fita e identificação e expedição de caixas. Cada caixa comporta até **9 garrafas**, em grade 3×3; as garrafas permanecem nas caixas enquanto elas são fechadas, identificadas e carregadas nos endereços livres do caminhão. Volume incorreto e tampa ausente bloqueiam a liberação.


## Missões e retomada

Cada ambiente oferece uma missão de 12 unidades. O objetivo só é concluído após as operações e a entrega real das unidades na linha integrada. **Iniciar com falha** prepara um desafio de diagnóstico; o aluno compara os sinais, identifica a causa, corrige o parâmetro ou a condição e retoma a mesma peça. O progresso e o resultado explicam o fluxo executado.

**Visão geral** mostra máquinas, filas, peças em processo e saídas. Clique numa máquina ou na sua identificação para abrir a bancada e os controles. As câmeras individuais originais continuam disponíveis.

O protótipo salva a atividade neste navegador, tanto localmente quanto no GitHub Pages. A retomada restaura a simulação pausada. Os registros existentes das contas e dos ambientes anteriores são preservados. O protótipo não exibe login nem botão de relatório.

O recebimento traz caixas de matéria-prima do baú antes de retirar os discos ou as garrafas com uma garra. A esteira de bebidas mantém velocidade linear constante, calibrada pelo transporte das panelas. O tempo das operações é separado do deslocamento; o envase mostra o líquido subindo de baixo até o ombro, deixando espaço sob a tampa. A lavagem usa a pinça existente, uma lança que enxágua o interior e aspira a água antes de se recolher.
