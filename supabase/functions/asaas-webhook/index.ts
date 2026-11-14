// Recebe os avisos do Asaas (cobrança criada, paga, vencida, apagada...)
// e atualiza a tabela de cobranças do sistema da ZXT.
// Publicar com: supabase functions deploy asaas-webhook --no-verify-jwt
// Segredo necessário: ASAAS_WEBHOOK_TOKEN (o mesmo texto cadastrado no webhook do Asaas)
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const resp = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return resp(200, { ok: true });

  const token = Deno.env.get("ASAAS_WEBHOOK_TOKEN");
  if (!token || req.headers.get("asaas-access-token") !== token) return resp(401, { erro: "token inválido" });

  let body: any;
  try { body = await req.json(); } catch { return resp(400, { erro: "json inválido" }); }

  const evento: string = body.event ?? "DESCONHECIDO";
  const pagamento = body.payment;
  const id: string = body.id ?? `${evento}:${pagamento?.id ?? ""}:${body.dateCreated ?? Date.now()}`;

  // idempotência: evento já processado com sucesso não roda de novo
  const { data: existente } = await sb.from("asaas_eventos").select("processado_em").eq("id", id).maybeSingle();
  if (existente?.processado_em) return resp(200, { ok: true, repetido: true });

  await sb.from("asaas_eventos").upsert({ id, evento, payment_id: pagamento?.id ?? null, payload: body, erro: null });

  if (!evento.startsWith("PAYMENT_") || !pagamento) {
    await sb.from("asaas_eventos").update({ processado_em: new Date().toISOString(), erro: "evento sem cobrança: ignorado" }).eq("id", id);
    return resp(200, { ok: true, ignorado: true });
  }

  const { data, error } = await sb.rpc("asaas_aplicar_pagamento", { p_evento: evento, p: pagamento });
  if (error) {
    await sb.from("asaas_eventos").update({ erro: error.message }).eq("id", id);
    // 500 faz o Asaas tentar de novo. O evento fica guardado em asaas_eventos para conferência.
    return resp(500, { erro: error.message });
  }
  await sb.from("asaas_eventos").update({ processado_em: new Date().toISOString(), erro: String(data).startsWith("ignorado") ? data : null }).eq("id", id);
  return resp(200, { ok: true, resultado: data });
});
