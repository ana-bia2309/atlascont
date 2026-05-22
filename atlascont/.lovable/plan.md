

# Adicionar campos Andar e Sala nas Ordens de Serviço

## Resumo
Adicionar dois novos campos de texto — **Andar** e **Sala** — na tabela `ordens_servico` e no formulário/listagem/visualização da página de O.S.

## Mudanças

### 1. Migração no banco (Supabase)
```sql
ALTER TABLE public.ordens_servico
  ADD COLUMN andar text,
  ADD COLUMN sala text;
```

### 2. Atualizar `src/pages/OrdensServico.tsx`
- Adicionar estados `andar` e `sala` no formulário
- Incluir dois campos `Input` no dialog de criação/edição, posicionados após o select de Bloco (em grid lado a lado)
- Incluir `andar` e `sala` no payload de save
- Incluir no `resetForm` e `openEdit`
- Adicionar colunas "Andar" e "Sala" na tabela de listagem
- Exibir os campos no dialog de visualização (detalhes)

### 3. Layout
- Bloco, Andar e Sala ficam em uma row de 3 colunas no formulário
- Na tabela, as colunas aparecem após "Bloco"

