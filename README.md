# Site oficial ZXT - Zulu Xtreme Team

Site público estático (HTML, CSS e JS, sem build) publicado na Vercel.

- `/`: página da equipe (modalidades, grade, eventos, time, loja, endereço)
- `/experimental`: link da bio do Instagram. Aceita `?origem=instagram`, `?modalidade=muay-thai` e `?indicou=Nome`

## Editar conteúdo
Tudo fica em `assets/config.js`: WhatsApp, grade, eventos e professores. Eventos com data passada somem sozinhos.

## Pendências (TODO_ZXT)
- Número do WhatsApp (enquanto vazio, os botões abrem o direct do Instagram)
- Horários de MMA e Jiu-Jitsu
- Nomes e fotos dos professores
- Logo oficial (hoje `assets/logo.svg` é um placeholder)

## Rodar local
```
python3 -m http.server 4173
```
Abra http://localhost:4173 (a rota `/experimental` sem `.html` só funciona na Vercel).

## Asaas (mensalidade recorrente por Pix ou cartão)
Fluxo: admin aprova o aluno (ou troca o plano) → o sistema cria a recorrência no Asaas ("pergunte ao cliente") → o Asaas manda a fatura todo mês → o aluno paga por Pix ou cartão (no cartão, as próximas caem sozinhas) → o webhook atualiza o status da cobrança aqui.

Publicar (uma vez):
```
supabase link --project-ref gsfvgdhjlqwrysgruyaj
supabase db push                                   # aplica 0010_asaas.sql
supabase secrets set ASAAS_API_KEY='$aact_hmlg_...' ASAAS_WEBHOOK_TOKEN='um-texto-longo-aleatorio'
supabase functions deploy asaas-sincronizar
supabase functions deploy asaas-webhook --no-verify-jwt
```
- Chave `$aact_hmlg_` usa o sandbox; `$aact_prod_` usa a produção. Trocar a chave troca o ambiente.
- Webhook no Asaas (Integrações > Webhooks): URL `https://gsfvgdhjlqwrysgruyaj.supabase.co/functions/v1/asaas-webhook`, token = `ASAAS_WEBHOOK_TOKEN`, eventos de cobrança, fila ativa.
- Alunos que já estavam ativos: botão **Sincronizar com Asaas** no Financeiro.
- O aluno precisa de CPF (menor: CPF do responsável, que vira o pagador).
- Promoção automática da 1ª mensalidade não vai para o Asaas: quem entra com promoção, lance a 1ª à mão e sincronize depois (o Asaas começa no mês seguinte).
- Testes: `supabase/tests/asaas.sql`.
