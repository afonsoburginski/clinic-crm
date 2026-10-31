# UI — Dialogs, alertdialogs e sheets

Implementação: `components/ui/{dialog,alert-dialog,sheet}.tsx`, `components/ui/dialog-sizes.ts`, `components/ui/layers.ts`, `shared/ui/molecules/{confirm-dialog,dialog-states}.tsx`
Testes: `shared/ui/__tests__/dialog-contract.test.ts` (tamanhos, escala de camadas e varredura dos usos; sem navegador).

## Anatomia

Todo dialog tem três faixas dentro do `DialogContent`:

| Peça | Papel |
| --- | --- |
| `DialogHeader` | Título e descrição. Fixo (`shrink-0`), com borda inferior e espaço à direita para o botão de fechar. |
| `DialogBody` | **Único trecho que rola** (`min-h-0 flex-1 overflow-y-auto`), com `--dialog-pad`. Formulário e conteúdo ficam aqui. |
| `DialogFooter` | Ações. Fixo (`shrink-0`), com borda superior. Em formulários, o botão de envio usa `form="<id>"`. |

- O popup é uma coluna flex com `overflow-hidden` quando há `DialogBody` e altura máxima de `90dvh`. Sem `DialogBody` (diálogo curto), o popup inteiro rola.
- Se o `<form>` envolve header, corpo e footer, ele recebe `className="flex min-h-0 flex-1 flex-col"` (ver `appointment-form-dialog.tsx`).
- Estados de carregamento e erro de dialogs de detalhe usam `DialogLoadingState`/`DialogErrorState`, que já trazem o header e o `DialogBody`.
- Abaixo de `sm` (640px) o dialog encosta na base (bottom sheet) com altura máxima `calc(100dvh - 1rem)`.
- Foco, Esc, clique fora, botão "Fechar" e bloqueio de rolagem da página vêm do `@base-ui/react/dialog`.

## Tamanhos (`size`)

Largura sempre `min(92vw, X)`: nunca estoura a tela. Não definir largura, altura ou `max-w-*` por `className`.

| Variante | Largura | Quando usar |
| --- | --- | --- |
| `sm` | 480px | Poucos campos: serviço, sala, redefinir senha, meta, responsáveis. |
| `md` (padrão) | 720px | Formulários comuns de 1–2 colunas: profissional, agendamento, lançamento, usuário, documento, avaliação, plano ABA, tour. |
| `lg` | 960px | Conteúdo longo ou denso: detalhes (lançamento, documento, registro) e registro clínico. Formulários grandes de edição (item 7). |
| `xl` | 1100px | Telas de edição com muitas seções (formulário completo de paciente). |

`lg` e `xl` têm altura mínima (`min(50dvh, 24rem)` e `min(60dvh, 28rem)`) para a altura não "pular" entre carregando e pronto.

### AlertDialog / ConfirmDialog

Sempre centrado e curto, na largura `sm` dos dialogs (`min(92vw, 480px)`; variante compacta `size="sm"` = `min(92vw, 20rem)`), altura máxima `90dvh`. Ações destrutivas usam `AlertDialogMedia tone="danger"` e `ConfirmDialog destructive`.

### Sheet

Mesmo contrato dos dialogs: `SheetHeader` e `SheetFooter` fixos, `SheetBody` rolável. `size`: `nav` (18rem, menu móvel), `sm` (384px), `md` (448px, padrão), `lg` (576px), todos `min(92vw, X)`. Painéis `top`/`bottom` limitam a altura a `90dvh`.

## Camadas (z-index)

Escala única em `components/ui/layers.ts` (strings estáticas para o Tailwind):

| Camada | Classe | Componentes |
| --- | --- | --- |
| Página fixa | `z-20`/`z-30` | toolbar, topbar |
| Dialog | `z-50` | scrim, dialog, alertdialog, sheet, command palette |
| Popover | `z-60` | popover, select, dropdown/menu, combobox, date picker |
| Tooltip | `z-70` | tooltip |
| Toast | (própria da lib) | sonner |

Popovers e selects dentro de um dialog usam o portal do base-ui na mesma árvore flutuante: abrem acima do dialog, rolam sem fechá-lo e devolvem o foco ao gatilho. Componente novo que abre sobre dialogs deve usar `LAYERS.popover`, nunca `z-50`.

## Regras

- Novo dialog: `Dialog` → `DialogContent size="…"` → `DialogHeader` + `DialogBody` + `DialogFooter`. O teste varre `modules/` e `shared/` e falha se um `DialogContent` não usa `DialogBody`, se alguém define largura por `className` ou usa variante inexistente.
- Tokens, tipografia e espaçamentos são os do design system (`--dialog-pad`, `glass-modal`, `glass-sticky`); sem roxo/violeta.

## Formulário em dialog (`FormDialog`)

Todo formulário de criar/editar usa `shared/ui/molecules/form-dialog.tsx` (nunca `Dialog` + `DialogContent` montados à mão): ele monta header fixo (`title`/`description`), corpo rolável (`children` = o `<form id={formId}>`), rodapé fixo (Cancelar + botão de enviar com `form={formId}`) e o aviso de descarte.

- `isDirty` (hook-form: `form.formState.isDirty`; formulário de `useState`: comparação com o estado inicial): fechar por Esc, clique fora, X ou Cancelar pede "Descartar alterações?" (`ConfirmDialog` aninhado). Salvar com sucesso chama `onClose` direto, sem confirmar.
- Durante o envio (`pending`) o dialog não fecha e Cancelar fica desabilitado: o resultado (sucesso ou erro) sempre chega a quem está olhando. Erro da API continua no formulário, sem fechar.
- Edição de registro que a tela não tem em mãos (ex.: `?editar=<id>` numa lista paginada no servidor): `FormDialogLoader` busca o registro e mostra carregando/erro no mesmo dialog; `FormDialogState` é o dialog sem formulário (carregando/erro).
- Tamanhos: `sm` poucos campos; `md` padrão; `lg`/`xl` formulários grandes (paciente: `xl`). O foco inicial vai para o primeiro campo (primeiro elemento focável do corpo).

## Dialog por rota/query

Criar e editar **não trocam a tela**: o dialog abre por cima da lista ou da ficha, que continuam montadas (cabeçalho, abas, filtros e rolagem intactos). O estado "dialog aberto" mora na URL, então o link é compartilhável e sobrevive a F5.

| Query | Onde | Abre |
| --- | --- | --- |
| `?novo=1` | listas (`/pacientes`, `/profissionais`, `/servicos`, `/salas`, `/financeiro`, `/documentos`, `/aba`, `/avaliacoes`, `/prontuarios/<paciente>`, `/configuracoes?aba=usuarios`) | dialog de criação |
| `?editar=<id>` | as mesmas listas | dialog de edição do registro `id` |
| `?editar=1` | fichas (`/pacientes/<id>`, `/profissionais/<id>`, `/aba/<id>`) | dialog de edição do registro da própria página |

Regras (`shared/lib/url-dialog.ts` puro + `shared/lib/use-url-dialog.ts`):

- `useUrlDialog("novo" | "editar")` devolve `{ isOpen, value, open(value?), close() }`; `useUrlEditor({ items, isLoading, allowed })` é a forma pronta para listas (`creating`, `editing`, `openNew`, `openEdit(item)`, `close`); `useUrlDialogGate` aplica a permissão em fichas; `useUrlParam("aba")` guarda a aba ativa na URL.
- A troca de URL é `history.replaceState` (integrado ao `useSearchParams` do Next): não navega, não refaz a rota, não remonta a página (aba ativa e rolagem ficam como estão) e **não cria entrada no histórico** ("Voltar" sai da página, não "fecha o dialog"). Os demais parâmetros e o hash são preservados.
- `novo` e `editar` são mutuamente exclusivos: abrir um remove o outro. Valores fora de `[\w.-]{1,100}` são ignorados.
- Sem permissão (`allowed` falso), ou com `?editar=<id>` que a lista não tem, o parâmetro é removido e um aviso é mostrado; o dialog nunca fica preso.
- Duplicar é estado local (o `template` não vai para a URL). Dialogs secundários de fichas (vínculo de responsável, meta e sessão ABA, especialidade, redefinir senha, reagendar) são estado local, sem deep-link, mas usam o mesmo `FormDialog`.
- `useSearchParams` exige `Suspense`: o `PanelShell` envolve todas as telas do painel.
- Rotas antigas `/pacientes/novo` e `/pacientes/<id>/editar` só fazem `redirect()` no servidor para a página pai com a query. Sem sessão, o painel leva ao login com `?next=` e o login volta ao mesmo endereço (`shared/lib/return-to.ts`).
- A agenda mantém o atalho existente `/agenda?novo=1&paciente=<id>`, que abre o agendamento já preenchido e consome os parâmetros.

O teste `shared/ui/__tests__/edit-dialog-contract.test.ts` varre o código: rotas `/editar` e `/novo` só redirecionam, nenhum arquivo navega para `/editar` ou `/novo`, todo dialog com `useForm` usa `FormDialog` e as telas listadas usam `useUrlEditor`/`useUrlDialog`.
