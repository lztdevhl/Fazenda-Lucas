begin;

-- The spreadsheet supplied for Fazenda Lucas replaces the default expense list.
-- Income and investment categories remain available because they are not part of
-- the supplied expense list.
create or replace function public.seed_financial_categories()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.financial_categories (farm_id, category_type, name, is_system)
  select new.id, seed.category_type, seed.name, true
  from (values
    ('income', 'Venda de suínos'), ('income', 'Venda de leitões'), ('income', 'Venda de matrizes'),
    ('income', 'Venda de reprodutores'), ('income', 'Bonificações de integração'),
    ('income', 'Venda de subprodutos'), ('income', 'Outras receitas'),

    ('expense', 'Energia elétrica 10001366066'), ('expense', 'Energia elétrica 10001365990'),
    ('expense', 'Manutenção e reparos'), ('expense', 'Carregamento de animais'),
    ('expense', 'Lavação instalações'), ('expense', 'Material limpeza/higiene'),
    ('expense', 'Uniformes'), ('expense', 'Telefonemas'), ('expense', 'Ivanilson'),
    ('expense', 'Atomicleia'), ('expense', 'Salário Zezinho'), ('expense', 'Salário Sione'),
    ('expense', 'FUNDEPEC'), ('expense', 'Outros'), ('expense', 'Composteira'),
    ('expense', 'Custos Fixos'), ('expense', 'EPIs'), ('expense', 'Gasolina'),
    ('expense', 'Salário Polivalente'), ('expense', 'Bomba'), ('expense', 'Canos'),
    ('expense', 'Homogenizador dejeto'), ('expense', 'manutenção lagoas'),
    ('expense', 'Biodigestor'), ('expense', 'Contabilidade'), ('expense', 'Exames Medicos'),
    ('expense', 'Recisão de trabalho'), ('expense', 'DARF'), ('expense', 'I.O.F'),
    ('expense', 'Inss'), ('expense', 'Fgts'), ('expense', 'Declaração Imposto de Renda'),
    ('expense', 'Protec Assessoria'), ('expense', 'Roçadeira/ STIHL 290'),
    ('expense', 'Roçadeira/BRISTON'), ('expense', 'Roçadeira/HUSQVARNA 345F'),
    ('expense', 'Roçadeira STIHL PAI 380'), ('expense', 'Motosserra STIHL'),
    ('expense', 'Cortador de grama FIAT'), ('expense', 'Cortador de grama Trap 51E'),
    ('expense', 'Furador de poste furadeira'), ('expense', 'Furador de buraco palanque'),
    ('expense', '2 bomba jacto'), ('expense', 'Triturador'), ('expense', 'Trator'),
    ('expense', 'Carreta'), ('expense', 'Roçadeira trator'), ('expense', 'Etanol'),
    ('expense', 'Diesel'), ('expense', 'Oleo 2 tempos'), ('expense', 'Pro labore Ivonir'),
    ('expense', 'Pro labore Lucas'), ('expense', 'Rural PJ (Holding)'), ('expense', 'Gado'),
    ('expense', 'Moto YBR'), ('expense', 'Financiamentos'), ('expense', 'Diversos'),
    ('expense', 'Licença Ambiental'), ('expense', 'Internet fazenda'), ('expense', 'Aginterp'),
    ('expense', 'Energia Fazenda'), ('expense', 'juros bancario'),

    ('productive_investment', 'Construção de galpões'), ('productive_investment', 'Reformas'),
    ('productive_investment', 'Equipamentos de alimentação'), ('productive_investment', 'Sistemas de ventilação'),
    ('productive_investment', 'Sistemas de climatização'), ('productive_investment', 'Máquinas'),
    ('productive_investment', 'Geradores'), ('productive_investment', 'Ampliação de instalações'),
    ('productive_investment', 'Outras melhorias'),
    ('financial_investment', 'Renda fixa'), ('financial_investment', 'Outros investimentos financeiros')
  ) as seed(category_type, name);
  return new;
end;
$$;

-- Bring existing farms to the new expense list. Categories already used by
-- transactions are kept to preserve history; unused system categories are removed.
insert into public.financial_categories (farm_id, category_type, name, is_system)
select f.id, seed.category_type, seed.name, true
from public.farms f
cross join (values
  ('expense', 'Energia elétrica 10001366066'), ('expense', 'Energia elétrica 10001365990'),
  ('expense', 'Manutenção e reparos'), ('expense', 'Carregamento de animais'),
  ('expense', 'Lavação instalações'), ('expense', 'Material limpeza/higiene'),
  ('expense', 'Uniformes'), ('expense', 'Telefonemas'), ('expense', 'Ivanilson'),
  ('expense', 'Atomicleia'), ('expense', 'Salário Zezinho'), ('expense', 'Salário Sione'),
  ('expense', 'FUNDEPEC'), ('expense', 'Outros'), ('expense', 'Composteira'),
  ('expense', 'Custos Fixos'), ('expense', 'EPIs'), ('expense', 'Gasolina'),
  ('expense', 'Salário Polivalente'), ('expense', 'Bomba'), ('expense', 'Canos'),
  ('expense', 'Homogenizador dejeto'), ('expense', 'manutenção lagoas'),
  ('expense', 'Biodigestor'), ('expense', 'Contabilidade'), ('expense', 'Exames Medicos'),
  ('expense', 'Recisão de trabalho'), ('expense', 'DARF'), ('expense', 'I.O.F'),
  ('expense', 'Inss'), ('expense', 'Fgts'), ('expense', 'Declaração Imposto de Renda'),
  ('expense', 'Protec Assessoria'), ('expense', 'Roçadeira/ STIHL 290'),
  ('expense', 'Roçadeira/BRISTON'), ('expense', 'Roçadeira/HUSQVARNA 345F'),
  ('expense', 'Roçadeira STIHL PAI 380'), ('expense', 'Motosserra STIHL'),
  ('expense', 'Cortador de grama FIAT'), ('expense', 'Cortador de grama Trap 51E'),
  ('expense', 'Furador de poste furadeira'), ('expense', 'Furador de buraco palanque'),
  ('expense', '2 bomba jacto'), ('expense', 'Triturador'), ('expense', 'Trator'),
  ('expense', 'Carreta'), ('expense', 'Roçadeira trator'), ('expense', 'Etanol'),
  ('expense', 'Diesel'), ('expense', 'Oleo 2 tempos'), ('expense', 'Pro labore Ivonir'),
  ('expense', 'Pro labore Lucas'), ('expense', 'Rural PJ (Holding)'), ('expense', 'Gado'),
  ('expense', 'Moto YBR'), ('expense', 'Financiamentos'), ('expense', 'Diversos'),
  ('expense', 'Licença Ambiental'), ('expense', 'Internet fazenda'), ('expense', 'Aginterp'),
  ('expense', 'Energia Fazenda'), ('expense', 'juros bancario')
) as seed(category_type, name)
where not exists (
  select 1
  from public.financial_categories c
  where c.farm_id = f.id
    and c.category_type = seed.category_type
    and lower(c.name) = lower(seed.name)
);

delete from public.financial_categories c
where c.category_type = 'expense'
  and c.is_system
  and not exists (
    select 1
    from (values
      ('Energia elétrica 10001366066'), ('Energia elétrica 10001365990'),
      ('Manutenção e reparos'), ('Carregamento de animais'), ('Lavação instalações'),
      ('Material limpeza/higiene'), ('Uniformes'), ('Telefonemas'), ('Ivanilson'),
      ('Atomicleia'), ('Salário Zezinho'), ('Salário Sione'), ('FUNDEPEC'), ('Outros'),
      ('Composteira'), ('Custos Fixos'), ('EPIs'), ('Gasolina'), ('Salário Polivalente'),
      ('Bomba'), ('Canos'), ('Homogenizador dejeto'), ('manutenção lagoas'), ('Biodigestor'),
      ('Contabilidade'), ('Exames Medicos'), ('Recisão de trabalho'), ('DARF'), ('I.O.F'),
      ('Inss'), ('Fgts'), ('Declaração Imposto de Renda'), ('Protec Assessoria'),
      ('Roçadeira/ STIHL 290'), ('Roçadeira/BRISTON'), ('Roçadeira/HUSQVARNA 345F'),
      ('Roçadeira STIHL PAI 380'), ('Motosserra STIHL'), ('Cortador de grama FIAT'),
      ('Cortador de grama Trap 51E'), ('Furador de poste furadeira'),
      ('Furador de buraco palanque'), ('2 bomba jacto'), ('Triturador'), ('Trator'),
      ('Carreta'), ('Roçadeira trator'), ('Etanol'), ('Diesel'), ('Oleo 2 tempos'),
      ('Pro labore Ivonir'), ('Pro labore Lucas'), ('Rural PJ (Holding)'), ('Gado'),
      ('Moto YBR'), ('Financiamentos'), ('Diversos'), ('Licença Ambiental'),
      ('Internet fazenda'), ('Aginterp'), ('Energia Fazenda'), ('juros bancario')
    ) as keep(name)
    where lower(keep.name) = lower(c.name)
  )
  and not exists (
    select 1 from public.financial_transactions t
    where t.farm_id = c.farm_id and t.category_id = c.id
  )
  and not exists (
    select 1 from public.investment_records r
    where r.farm_id = c.farm_id and r.category_id = c.id
  );

commit;
