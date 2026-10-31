# UI — Menu de contexto e menu "⋯" das entidades

Implementação: `components/ui/context-menu.tsx` (base), `shared/ui/entity-menu/` (`entity-menu.tsx`, `lib/build-menu.ts`, `lib/clipboard.ts`, `testing.ts`), integração em `shared/ui/data-table/` (`lib/column-actions.ts`, `data-table.tsx`) e ações por módulo em `modules/<módulo>/lib/<entidade>-actions.ts`.
Testes: `shared/ui/entity-menu/__tests__/{build-menu,entity-menu-contract}.test.ts`, `shared/ui/data-table/__tests__/column-actions.test.ts` e `modules/*/lib/__tests__/*-actions.test.ts`. Sem navegador: a lógica é pura e o contrato varre o código.

O clique direito e o botão "⋯" abrem **o mesmo menu**, gerado de **uma única lista** de ações. Não existe menu feito à mão em tela alguma.

## Peças

| Peça | Papel |
| --- | --- |
| `components/ui/context-menu.tsx` | Raiz, gatilho e popup do `@base-ui/react/context-menu`. Os itens (item, checkbox, radio, submenu, separador, rótulo, atalho, variante destrutiva) são **os mesmos do `dropdown-menu.tsx`**, reexportados como `ContextMenu*`: os dois menus ficam idênticos. O popup usa `LAYERS.popover` (z-60): abre por cima de dialogs. |
| `EntityAction` (`lib/build-menu.ts`) | Definição declarativa de uma ação (abaixo). |
| `buildMenu(actions, can)` | Filtra por permissão e regra de negócio, agrupa, põe separadores e descarta submenus vazios. Puro. |
| `<EntityMenu actions>` | Provedor das ações de **uma** entidade: resolve para o usuário da sessão, copia, confirma e executa. Um `ConfirmDialog` por entidade. |
| `<EntityContextMenu render?>` | Área do clique direito. `render={<tr />}` (ou `<li />`, `<button />`) mantém a semântica do elemento. |
| `<EntityActionsButton label>` | Botão "⋯" (`aria-label="Ações"`, ou `Ações de <nome>`). Dropdown do mesmo menu. |

Uso: `<EntityMenu actions={ações}><EntityContextMenu render={<li />}>…<EntityActionsButton /></EntityContextMenu></EntityMenu>`.

## `EntityAction`

| Campo | Regra |
| --- | --- |
| `id`, `label` | `id` estável por entidade; `label` em pt-BR. |
| `icon` | Ícone lucide opcional. |
| `permission` | `Permission` ou lista (qualquer uma libera). **Sem permissão a ação some do menu** (não só desabilita). A API revalida toda ação. |
| `hidden` | Regra de negócio: a ação não se aplica ao item (lançamento cancelado não recebe pagamento). |
| `disabled` | `true` ou texto com o motivo. O item continua visível e o motivo aparece **na própria linha** (o tooltip nativo não aparece em item sem ponteiro). |
| `group` | Itens de grupos diferentes são separados por uma linha, na ordem da primeira aparição. Grupos usuais: `clipboard`, `status`. Ação destrutiva sem grupo vai para o grupo `danger`, **sempre por último**. |
| `kind: "copy"` | `text` vai para a área de transferência (`navigator.clipboard`, com fallback `execCommand`) e o toast diz "<assunto> copiado." (`successMessage` opcional). |
| `kind: "submenu"` | `items` aninhados (ex.: "Alterar situação" na agenda). Submenu sem item permitido some. |
| `destructive: true` | Obriga `confirm`: o `ConfirmDialog` abre antes de executar (o menu fecha, o diálogo abre). Item em vermelho. |
| `confirm` | `{ title, description?, confirmLabel?, reason? }`. `reason` pede um motivo, que chega ao `onSelect(reason)`. Também serve para ações não destrutivas que pedem confirmação (emitir, ativar, finalizar). |
| `onSelect` | Pode devolver `Promise`. Erro síncrono ou rejeitado vira toast. As telas usam `mutation.mutate` (já notifica) para não duplicar o aviso. |

Nunca há "Excluir" inventado: onde o app não apaga, a ação destrutiva é a real — cancelar lançamento, arquivar documento, inativar paciente/profissional/serviço/sala, desativar usuário, remover vínculo, encerrar plano ABA, cancelar avaliação, cancelar atendimento. "Duplicar" abre o diálogo de criação **pré-preenchido** (prop `template`), sem chamada nova à API.

## Acessibilidade e teclado

- Clique direito, **pressão longa** (toque) e **tecla Menu / Shift+F10** abrem o menu (o navegador dispara `contextmenu` para os três; o gatilho do base-ui trata todos). Setas navegam, Enter/Espaço ativam, Esc fecha e devolve o foco.
- O "⋯" é um botão normal na ordem de Tab (`aria-haspopup`, `aria-expanded`), com nome acessível por entidade.
- Em linhas de tabela, **Enter/Espaço na linha continuam ativando `onRowClick`**; o "⋯" e o menu de contexto não propagam o clique à linha.
- Sem nenhuma ação visível para o usuário, o gatilho não intercepta o clique direito (vale o menu do navegador) e o "⋯" não aparece.

## DataTable

`DataTable` recebe `rowActions={(row, { expanded, toggleExpanded }) => EntityAction[]}` e `rowLabel={(row) => nome}`:

- ganha a coluna final **"⋯"**, fixa à direita (`sticky right-0`), fora da ordenação, do menu "Colunas" e da exportação;
- a `<tr>` fica dentro de `EntityContextMenu` (clique direito e Shift+F10 abrem o mesmo menu);
- `renderRowActions`, `rowMenu` e `renderHeaderMenu` (pontos de extensão do item anterior) foram substituídos por esta API.

**Cabeçalho de coluna** (`headerMenu`, ligado por padrão; clique direito no `<th>` ou "⋯" que aparece ao passar o mouse/focar): Ordenar crescente, Ordenar decrescente, Remover ordenação, Filtrar por esta coluna (leva o foco ao controle do filtro na toolbar e o abre), Ocultar coluna e Mostrar todas as colunas. Só aparece o que se aplica à coluna (`lib/column-actions.ts`). **Fixar coluna não existe.**

## Inventário por entidade

| Entidade | Onde | Ações (além de copiar ID/código) |
| --- | --- | --- |
| Paciente | lista, cabeçalho da ficha | Ver ficha, Editar cadastro (`patients:write`), Agendar (`appointments:write`, só ativo), Inativar (destrutiva) / Reativar |
| Responsável | lista de responsáveis | Editar (`guardians:write`), copiar telefone/e-mail |
| Vínculo | ficha do paciente | Editar vínculo, Remover vínculo (destrutiva) |
| Profissional | lista | Ver perfil e agenda, Editar (`professionals:manage`), Inativar (destrutiva) / Reativar |
| Serviço, Sala | listas | Editar, Duplicar, Inativar (destrutiva) / Reativar (`services:manage` / `rooms:manage`) |
| Plano ABA | lista | Ver, Editar (não encerrado), Duplicar, Ativar (precisa de objetivo ativo), Encerrar (destrutiva, motivo) — `clinical:write` |
| Avaliação | lista | Ver, Concluir (etapas feitas + interpretação; só o responsável), Cancelar (destrutiva, motivo) |
| Prontuário (paciente) | lista de prontuários | Abrir prontuário |
| Registro clínico | prontuário do paciente | Ver, Editar rascunho, Finalizar (≥ 20 caracteres), Retificar (motivo ≥ 10) — só o autor; nunca excluído |
| Documento | lista | Ver, Editar/Duplicar rascunho, Emitir, Gerenciar liberações, Arquivar (destrutiva) — pelo `canWrite` da classificação |
| Lançamento | lista do financeiro | Ver, Editar, Duplicar, Copiar código/valor, Registrar pagamento, Estornar pagamento (abre o detalhe), Cancelar (destrutiva, motivo; desabilitada com pagamentos ativos) — `finance:write` |
| Usuário | Configurações > Usuários | Editar, Alterar papéis, Redefinir senha, Desativar (destrutiva; não a si mesmo) / Reativar — `users:manage` |
| Papel | cabeçalho da matriz | Ver permissões, Editar permissões (leva o foco à coluna), copiar chave |
| Evento de auditoria | lista de auditoria | Ver/Recolher detalhes, copiar ID do evento, do recurso e descrição (imutável: sem editar nem excluir) |
| Agendamento / bloqueio | cards da grade e do mês, painel de detalhe, ficha do paciente | Ver detalhes, Reagendar/Editar bloqueio, Abrir ficha, Alterar situação (submenu; só as transições de `availableTransitions`), Copiar horário, Cancelar/Remover bloqueio (destrutiva, motivo conforme a clínica) |

Nos cards compactos da agenda (grade e mês) o equivalente ao "⋯" é o do painel de detalhe (`SheetHeader`), além do clique direito e do Shift+F10 no card focado.
