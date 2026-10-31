# Clinic API foundation

## Objetivo

Iniciar o backend como serviço independente em Bun + Hono, com fronteiras compatíveis com DDD, SDD, Clean Code e Clean Architecture, e contratos reutilizáveis entre frontend e backend.

## Requisitos funcionais

- RF-API-001: A API expõe `GET /health` para verificação de disponibilidade do processo.
- RF-API-002: A API expõe `GET /health/ready` para indicar se dependências essenciais, incluindo PostgreSQL quando configurado, estão prontas.
- RF-API-003: Contratos de resposta são definidos em pacote compartilhável e não dependem de Hono nem de `pg`.
- RF-API-004: PostgreSQL é a persistência prevista; conexão é obtida por configuração, nunca por credenciais embutidas.
- RF-API-005: Dados para dashboards devem ser consultáveis por período e projetados para leitura; tabelas de alto volume podem usar particionamento temporal.

## Regras de negócio/arquitetura

- RN-API-001: Rotas HTTP apenas adaptam transporte; casos de uso ficam na aplicação e não importam Hono.
- RN-API-002: Domínio não importa infraestrutura nem framework.
- RN-API-003: Contratos HTTP compartilhados ficam em `shared/contracts` e não duplicam tipos locais do frontend.
- RN-API-004: Não particionar entidades OLTP indiscriminadamente. Particionar tabelas append-only/read-models por data somente após definir chave temporal, retenção, filtros comuns e restrições de unicidade compatíveis com particionamento PostgreSQL.
- RN-API-005: Dashboards devem usar consultas agregadas/read models com filtros explícitos por intervalo de datas e índices alinhados; evitar varredura de dados clínicos desnecessários.

## Critérios de aceite

- CA-API-001: Dado o servidor montado, quando `GET /health` é chamado, então retorna HTTP 200 e contrato JSON válido.
- CA-API-002: Os testes de rota executam sem abrir porta ou exigir banco de dados.
- CA-API-003: Typecheck e testes passam com Bun.
- CA-API-004: O serviço inicia via comando de desenvolvimento documentado.
