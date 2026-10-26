# Progresso do aluno

O servidor usa a sessão autenticada existente. Cada conta possui um registro por ambiente (`cookware`, `beverages`, `parcels`, `furniture`), na tabela `student_progress` do banco privado de autenticação. A criação da tabela é aditiva. Não há credenciais nem checkpoints reais no armazenamento local do navegador.

## Cliente

```js
import { createProgressStore } from "./progress.js";
const store = createProgressStore("parcels");
const previous = await store.load(); // estado ou null; nunca salvar antes disso
if (previous) session.importState(previous.simulation); // restaura em pausa
await store.save({ version: 1, simulation: session.exportState(), mission, view, results });
await store.flush(); // esperar antes de sair, navegar ou encerrar a sessão
await store.dispose();
```

`view` contém `selected`, `scope` e, opcionalmente, `camera` (`front`, `iso`, `top`, `overview`). A missão contém `id`, `version: 1`, `status` e o estado de `missions.js`. Resultados concluídos anteriores podem continuar no histórico, limitado a 100 registros.

O store serializa as gravações e acompanha a revisão. A interface pode agrupar mudanças e salvar a cada dois segundos. Capture o estado em cada chamada; o store cria sua própria cópia. Para substituir uma atividade após uma ação explícita de novo início, use `save(state, { replace: true })`. Isso não contorna conflitos de revisão nem mudança da conta.

`load()` incompatível rejeita com `INCOMPATIBLE_PROGRESS`, preservando o registro e sua revisão. Só um reinício explícito permite substituí-lo. Erros `PROGRESS_CONFLICT` exigem carregar a versão atual antes de retomar; `ACCOUNT_CHANGED` e `UNAUTHENTICATED` exigem reabrir a atividade na conta correta. Uma falha de rede não deve ser apresentada como salvamento confirmado. `flush()` e `dispose()` propagam a última falha para a interface decidir entre tentar novamente e sair sem salvar alterações.

## HTTP

- `GET /api/progress`: conta atual, último ambiente e metadados dos registros.
- `GET /api/progress/:environment`: `{ owner, revision, state, compatible, metadata }`. Ausente: revisão zero e estado nulo.
- `PUT /api/progress/:environment`: `{ owner, expectedRevision, state, replace? }`. Retorna a próxima revisão e metadados.

`owner` vem da leitura anterior e só detecta troca de conta enquanto uma gravação estava na fila. A autorização usa exclusivamente o usuário da sessão; informar outro identificador não dá acesso a registros alheios. PUT exige a origem permitida, JSON e `X-Requested-With: Logistica`.

As revisões são comparadas dentro de uma transação SQLite. Conflitos retornam 409; um estado vazio também não substitui uma retomada sem `replace: true`. O limite do checkpoint é 512 KiB. A validação rejeita estruturas excessivas, credenciais, estado inconsistente do motor, produto/bancada inválidos e conclusão de missão sem as 12 unidades comprovadas em cada operação da linha.

## Demonstração do Pages

No modo Pages não há conta nem servidor: o store usa somente o prefixo `logistica:demo-progress:v1:` e informa que o salvamento é local. Ele nunca envia esse progresso à API. Quando disponível, Web Locks serializa gravações de abas da demonstração. O armazenamento autenticado nunca usa esse prefixo como fallback.
