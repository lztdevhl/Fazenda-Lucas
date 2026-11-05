# Fazenda Financeiro

Sistema financeiro para uma fazenda de suínos. As **Fases 1 a 5** entregam autenticação, núcleo financeiro, dashboard, investimentos produtivos e financeiros e relatórios financeiros.

## Arquitetura

- `src/app`: rotas do Next.js App Router. `(auth)` contém login e recuperação; `(app)` contém as páginas protegidas.
- `src/components`: layout e componentes de interface reutilizáveis, incluindo componentes no padrão shadcn/ui.
- `src/lib/supabase`: clientes de navegador e servidor, mais renovação de sessão por `proxy.ts`.
- `src/lib/validations` e `src/lib/finance`: esquemas Zod, tipos, consultas e utilitários de precisão monetária.
- `src/app/actions/finance.ts`: ações do servidor; verificam o proprietário antes de chamar funções SQL.
- `src/app/actions/investments.ts` e `src/lib/investments`: ações, validação, consultas e agregação do módulo de investimentos.
- `supabase/migrations`: esquema versionado, constraints, índices, gatilhos, categorias, RLS e operações financeiras atômicas.
- Os saldos são calculados no PostgreSQL. A interface apenas formata os valores decimais recebidos como texto.

## Configuração local

Requisitos: Node.js 20.9 ou superior, npm e um projeto Supabase.

1. Execute `npm install`.
2. Copie `.env.example` para `.env.local` e preencha as duas variáveis com a **Project URL** e a **publishable key** do Supabase:

   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sua-chave-publicavel
   ```

   Não adicione a `service_role` key ao projeto ou a variáveis `NEXT_PUBLIC_*`.
3. Aplique as migrations **na ordem**: `supabase/migrations/20261023000100_initial_schema.sql`, `supabase/migrations/20261023000200_financial_core.sql`, `supabase/migrations/20261023000300_dashboard_data.sql`, `supabase/migrations/20261027000100_dashboard_phase3.sql`, `supabase/migrations/20261027000200_investments.sql`, `supabase/migrations/20261030000100_manual_cashflow.sql`, `supabase/migrations/20261030000200_farm_units.sql` e `supabase/migrations/20261105000100_replace_expense_categories.sql`. Use a CLI (`supabase db push`, com o projeto vinculado) ou o SQL Editor. Execute somente as migrations ainda não aplicadas; não reaplique uma migration já executada.
4. No painel Supabase Auth, desative o cadastro público de novos usuários. Configure a Site URL como `http://localhost:3000` e inclua `http://localhost:3000/auth/callback` entre as URLs de redirecionamento. Em produção, inclua a URL equivalente do domínio Vercel.
5. Crie o proprietário administrativamente em **Authentication → Users → Add user**. Copie o UUID do usuário criado. No SQL Editor, execute uma transação como esta, substituindo os valores:

   ```sql
   begin;
   insert into public.farms (owner_id, name, owner_name, municipality, state_code)
   values ('UUID_DO_USUARIO', 'Nome da fazenda', 'Nome do proprietário', 'Município', 'SP');

   insert into public.profiles (id, farm_id, display_name)
   select owner_id, id, owner_name
   from public.farms
   where owner_id = 'UUID_DO_USUARIO';
   commit;
   ```

   A criação da fazenda semeia automaticamente as categorias iniciais. A aplicação não disponibiliza cadastro público nem permite que usuários criem fazendas por conta própria.
6. Execute `npm run dev` e abra `http://localhost:3000`. Entre com as credenciais criadas no Supabase Auth.

Se aparecer **“Acesso ainda não configurado”**, o usuário autenticado não tem uma linha em `farms` com seu UUID em `owner_id`. Execute o provisionamento do passo 5 usando o UID exato da conta de login.

Para testar no navegador: em **Entradas** ou **Saídas**, crie um lançamento, escolha uma categoria e depois registre manualmente o recebimento ou pagamento. Não é necessário cadastrar ou selecionar uma conta bancária. Um lançamento pendente pode ser editado ou cancelado; um liquidado pode ser estornado pelo botão em **Detalhes**. No **Dashboard**, escolha um período que inclua as datas usadas: pendências entram em contas a receber/pagar conforme o vencimento; entradas recebidas e saídas pagas entram pela data de liquidação.

Em **Investimentos**, cadastre um investimento produtivo como planejado ou pago. Um registro planejado não altera o caixa; ao ativá-lo, é criada exatamente uma transação `capital_expenditure` manual. Em **Detalhes**, confira o pagamento e estorne se necessário. Cadastre uma aplicação financeira com o aporte inicial e a avaliação manual. Registre aportes e resgates pelo modal de detalhes. Atualize o valor de mercado na edição: essa ação não altera o caixa.

Para Vercel, configure as mesmas duas variáveis de ambiente no projeto e aplique a migration no Supabase de produção. O fluxo de recuperação de senha exige que o provedor de e-mail do Supabase esteja configurado para entrega em produção.

## Modelo e regras financeiras

`farms` vincula a fazenda a um único proprietário autenticado. `profiles` guarda dados do proprietário. `financial_accounts` contém saldo inicial e data de referência. `financial_categories` contém categorias por natureza. `financial_transactions` será o registro único de eventos de caixa, com status `pending`, `settled` ou `cancelled`. `investment_records` guarda o cadastro patrimonial e `investment_movements` vincula aportes e resgates a transações financeiras liquidadas. `audit_logs` registra inserções e alterações relevantes.

- **Saldo disponível:** soma dos saldos iniciais de contas na respectiva data de referência, mais entradas e resgates liquidados, menos saídas, pagamentos de investimento produtivo e aportes liquidados. Transferências debitam uma conta e creditam outra, sem alterar o saldo consolidado.
- **Contas pendentes:** aparecem em contas a receber ou a pagar; não mudam o saldo até a liquidação. O status `cancelled` é reservado a lançamentos ainda pendentes.
- **Resultado operacional:** entradas operacionais menos despesas operacionais. Transferências, investimentos produtivos, aportes e resgates ficam fora desse resultado.
- **Competência e caixa:** `competency_date` serve à análise por competência. `settled_on` serve ao fluxo de caixa realizado. Os dois critérios não devem ser misturados em um mesmo total sem identificação.
- **Investimento produtivo:** seu pagamento usa uma transação `capital_expenditure`, vinculada ao registro patrimonial. O registro patrimonial não gera uma segunda saída de caixa. Planejamentos não movimentam o caixa. O estorno cria `reversal_capital_expenditure` e cancela o registro, preservando a trilha de auditoria.
- **Investimento financeiro:** `investment_records` representa a conta da aplicação; `investment_movements` registra créditos (aportes) e débitos (resgates) nessa conta representativa. Cada movimento possui uma transação financeira única na conta bancária de origem/destino. Aporte inicial e adicional usam `investment_contribution`; resgate usa `investment_withdrawal`. Estornos têm tipos próprios e efeito oposto. Esses movimentos não são despesa ou receita operacional. O valor de mercado e sua data são informados manualmente e não alteram o caixa. O capital líquido transferido é aportes menos resgates, considerando estornos; não é uma estimativa de rentabilidade.
- **Estorno:** um evento já liquidado é imutável. Uma função atômica cria `reversal_income` ou `reversal_expense`, com o mesmo valor e conta, vinculado ao original por `reversal_of_id`. O efeito no caixa é oposto, sem apagar o histórico.
- **Idempotência:** cada transação requer `idempotency_key`, único por fazenda. Serviços futuros deverão reutilizar essa chave em tentativas repetidas da mesma operação.

Valores são `numeric(18,2)` no PostgreSQL. Os saldos são calculados no banco e retornam como texto; formatação e soma de totais de listagem usam centavos inteiros (`bigint`). Cada chamada às funções SQL ocorre em uma transação PostgreSQL. As funções verificam `auth.uid()` e resolvem a fazenda sem aceitar `farm_id` do cliente. Não há pagamento parcial nem parcelamento nesta fase.

## Segurança

O `proxy.ts` renova a sessão, e o layout protegido verifica o JWT com `getClaims()` e exige uma fazenda vinculada ao usuário. Todas as tabelas privadas têm RLS. O papel autenticado mantém apenas leitura direta; escritas passam pelas funções SQL da Fase 2, que validam proprietário, status, contas e categorias. Não há exclusão física de lançamentos. O navegador recebe apenas a publishable key. Uma conta Auth sem fazenda vinculada vê somente a página de acesso pendente.

## Fases

1. **Fundação — concluída:** projeto, layout, autenticação, migrations, RLS, páginas vazias.
2. **Núcleo financeiro — implementado:** contas, categorias, lançamentos, liquidação, estorno, saldo e testes financeiros. Requer aplicação da segunda migration no Supabase alvo.
3. **Dashboard — implementado:** sete indicadores, cinco gráficos Recharts, filtros globais, comparação ao período anterior, últimas 10 movimentações, próximas contas e atalhos de cadastro. Requer a terceira e a quarta migrations.
4. **Investimentos — implementado:** registros produtivos planejados/pagos, aplicações, aportes, resgates, avaliação manual, estornos, histórico, filtros e gráficos. Requer a quinta migration.
5. **Relatórios — implementado:** análises, filtros, CSV, XLSX e PDF via impressão.
6. **Qualidade e publicação — pendente:** revisão mobile, testes de autorização e deploy.

## Pontos de escopo

O produto opera com um proprietário, mas usa `farm_id` para manter os dados isolados e permitir evolução futura. A criação inicial de usuário e fazenda é administrativa. O dashboard usa eventos reais, sem números fictícios. O saldo disponível é calculado no PostgreSQL **na data final selecionada**; a série histórica respeita as datas dos saldos iniciais das contas e exclui transferências do saldo consolidado. Os indicadores de entradas, despesas, resultado e pendências seguem o período selecionado. O card de despesas vencidas é calculado em relação a hoje; as próximas contas mostram até cinco de cada tipo a partir de hoje. Resultados usam regime de caixa, não lucro contábil. Estornos entram com sinal oposto na data do estorno; cancelados são excluídos. A série retorna no máximo cerca de 91 pontos para limitar o tráfego. Os gráficos convertem totais já apurados para coordenadas visuais; os valores exibidos preservam centavos exatos. A listagem da Fase 2 não tem paginação; seus filtros de data usam a **data de competência**. O total filtrado exclui lançamentos cancelados e estornados e inclui pendentes.

Na página de investimentos, os cartões de infraestrutura e capital aplicado mostram posição histórica até o fim do período. Aportes, resgates e gráficos de movimentação seguem o período escolhido. O cartão de valor de mercado mostra a **última avaliação manual** das aplicações ativas selecionadas, mesmo ao consultar um período passado; não existe série histórica de avaliações. Registros listados são os criados ou movimentados no período. O cancelamento de uma aplicação exige que todos os seus movimentos tenham sido estornados; para encerramento normal, use o status **Concluído**. A avaliação manual pode ficar desatualizada após novos aportes ou resgates e deve ser revista pelo proprietário.

## Verificações

```bash
npm run typecheck
npm run lint
npm run build
npm test
```

`npm test` executa testes de valores monetários, filtros, indicadores, investimentos e operações SQL em um PostgreSQL embarcado (PGlite), aplicando as cinco migrations. Isso verifica atomicidade, saldo histórico, vinculação investimento/transação, estornos, cancelamentos e RLS localmente. A quinta migration ainda precisa ser aplicada e validada no projeto Supabase real; a aplicação possui somente URL e chave publicável, sem acesso administrativo ao banco. Não há integração bancária/corretora nem cálculo automático de rentabilidade nesta fase.

## Relatórios financeiros (Fase 5)

A rota `/relatorios` consulta os lançamentos autorizados da fazenda no servidor e oferece fluxo de caixa, receitas, despesas, resultado operacional, contas a pagar/receber e investimentos. Os filtros de período, conta, categoria, agrupamento e regime são aplicados antes da agregação. Cancelamentos são excluídos, estornos preservam o sinal correto e transferências internas entre contas selecionadas não inflacionam o fluxo consolidado.

Os botões da página geram CSV em UTF-8 com separador compatível com Excel brasileiro, XLSX com aba de parâmetros e colunas numéricas, e PDF pelo diálogo de impressão do navegador. No diálogo de impressão, escolha “Salvar como PDF”; o layout de impressão inclui cabeçalho da fazenda, período, indicadores, tabela e rodapé com paginação.

O módulo usa a dependência `write-excel-file` somente no navegador para criar o arquivo Excel com os dados já filtrados. Não foi necessária uma nova migration: os relatórios usam as tabelas e políticas RLS existentes das Fases 1–4.
