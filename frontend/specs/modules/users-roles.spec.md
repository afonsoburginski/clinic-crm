# USR — Usuários, papéis e permissões

Implementação: `domain/{permissions,roles-matrix,schemas}.ts`, `shared/api/{users-api,user-mappers,user-directory}.ts`, `modules/users/` (aba dentro de `modules/settings/components/settings-view.tsx`) · Backend: `backend/specs/users-roles.spec.md`
Testes: `domain/__tests__/{roles-matrix,users,permissions}.test.ts`, `shared/api/__tests__/users-http.test.ts`

## Requisitos

- **RF-USR-001** Em Configurações, a aba **Usuários** lista os usuários da clínica (nome, e-mail, papéis, profissional vinculado, situação) com busca, estados de carregamento, vazio e erro.
- **RF-USR-002** Quem tem `users:manage` cria e edita usuários em diálogo (nome, e-mail, senha inicial na criação, papéis em multisseleção, profissional vinculado opcional, acesso ativo), redefine a senha e desativa/reativa. Desativar pede confirmação; usuários não são apagados.
- **RF-USR-003** A aba **Papéis e permissões** mostra a matriz papel × permissão agrupada por área, com a contagem de usuários por papel. Quem tem `users:manage` marca e desmarca células e salva; os demais só leem. Só os papéis alterados são enviados.
- **RF-USR-004** A navegação mostra Configurações para quem tem `settings:manage` ou `users:read`; cada aba aparece só para quem tem a permissão dela (`settings:manage` → Clínica; `users:read` → Usuários e Papéis). Toda ação de escrita fica dentro de `PermissionGate permission="users:manage"`.
- **RF-USR-005** Quem tem `users:read` vê o nome de quem agiu (autor de registros, pagamentos, liberações, interpretações e eventos de auditoria); os demais perfis veem o rótulo "Usuário da clínica". A lista de nomes é carregada uma vez por minuto, sem chamada para perfis sem a permissão.

## Regras de negócio

- **RN-USR-001** A UI esconde, a API decide: leitura exige `users:read` e escrita `users:manage` (403 caso contrário).
- **RN-USR-002** E-mail é único por clínica, sem diferenciar maiúsculas; duplicado mostra "Já existe um usuário com este e-mail.".
- **RN-USR-003** A clínica mantém ao menos um administrador ativo: desativar o último, ou tirar o papel dele, é recusado com a mensagem da API.
- **RN-USR-004** Senha com no mínimo 8 caracteres (criação e redefinição); a redefinição exige confirmação igual e encerra as sessões do usuário. A senha nunca é guardada nem exibida no cliente.
- **RN-USR-005** Papéis são os 5 de sistema (Administrador, Recepção, Profissional, Financeiro, Gestor); a UI não cria papel novo. Cada usuário tem ao menos um papel.
- **RN-USR-006** A matriz é salva por papel (um PUT por papel alterado); depois a sessão do usuário atual é relida, porque a alteração pode mudar as permissões dele.
- **RN-USR-007** Células travadas: o Administrador nunca recebe `clinical:read/write` (RN-AUTH-002) e a UI as mostra desmarcadas e desabilitadas, com aviso.
- **RN-USR-008** O Administrador mantém `users:read`, `users:manage` e `settings:manage`: a UI as mostra marcadas e desabilitadas; a API também recusa tirá-las (422).
- **RN-USR-009** Quem tem o papel Profissional sem profissional vinculado vê o aviso de que precisa do vínculo para acessar a própria agenda e os pacientes que atende.

## Critérios de aceite

- **CA-USR-001** Dado um perfil sem `users:read`, quando abre Configurações, então só vê as abas que a permissão dele libera (ou "Acesso restrito" se nenhuma).
- **CA-USR-002** Dado um perfil com `users:read` e sem `users:manage`, quando abre Usuários ou Papéis, então não vê botões de criar, editar, redefinir senha, desativar nem o botão de salvar a matriz, e as caixas ficam desabilitadas.
- **CA-USR-003** Dado o único administrador ativo, quando se tenta desativá-lo, então a API recusa (409) e a tela mostra a mensagem, sem alterar nada.
- **CA-USR-004** Dada senha com menos de 8 caracteres, quando se salva, então o formulário recusa sem chamar a API.
- **CA-USR-005** Dada a matriz com o papel Recepção alterado, quando se salva, então só a Recepção é enviada e a matriz recarrega do servidor.
- **CA-USR-006** Dado o papel Administrador, então as células de `clinical:*` ficam desmarcadas e as de usuários/configurações marcadas, todas desabilitadas.
- **CA-USR-007** Dado um perfil com `users:read`, quando abre o detalhe de um lançamento com pagamento registrado por outra pessoa, então vê o nome dela; sem a permissão, vê "Usuário da clínica".
