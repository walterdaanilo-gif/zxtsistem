// Leva as assinaturas do sistema da ZXT para o Asaas.
// - Assinatura ativa sem vínculo: cria o cliente (se preciso) e a assinatura recorrente no Asaas.
//   Forma de pagamento "pergunte ao cliente": o aluno escolhe Pix ou cartão na fatura.
//   Se pagar no cartão, as próximas mensalidades são debitadas sozinhas no cartão.
// - Assinatura encerrada (troca de plano, saída): cancela a recorrência no Asaas.
// Só o admin chama (botão no Financeiro, aprovação e troca de plano).
// Publicar com: supabase functions deploy asaas-sincronizar
// Segredo necessário: ASAAS_API_KEY ($aact_hmlg_... = sandbox, $aact_prod_... = produção)
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const resp = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const URL_SB = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(URL_SB, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

const CHAVE = Deno.env.get("ASAAS_API_KEY") ?? "";
const BASE = CHAVE.startsWith("$aact_prod_") ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3";
const CICLO: Record<string, string> = { mensal: "MONTHLY", trimestral: "QUARTERLY", semestral: "SEMIANNUALLY", anual: "YEARLY" };
const MESES: Record<string, number> = { mensal: 1, trimestral: 3, semestral: 6, anual: 12 };

async function asaas(metodo: string, caminho: string, corpo?: unknown) {
  const r = await fetch(BASE + caminho, {
    method: metodo,
    headers: { "Content-Type": "application/json", "User-Agent": "zxtsistem/1.0 (Supabase Edge)", access_token: CHAVE },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const txt = await r.text();
  const json = txt ? JSON.parse(txt) : {};
  if (!r.ok) {
    const msg = json?.errors?.map((e: any) => e.description).join("; ") || `HTTP ${r.status}`;
    throw Object.assign(new Error(msg), { status: r.status });
  }
  return json;
}

const so = (v?: string | null) => (v ?? "").replace(/\D/g, "");
const hojeFortaleza = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Fortaleza" });
function somaMeses(iso: string, n: number, dia: number) {
  const [y, m] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, dia));
  return d.toISOString().slice(0, 10);
}

async function garantirCliente(a: any): Promise<string> {
  if (a.provider_customer_id) return a.provider_customer_id;
  const { data: outra } = await admin.from("assinaturas").select("provider_customer_id")
    .eq("aluno_id", a.aluno_id).not("provider_customer_id", "is", null).limit(1).maybeSingle();
  if (outra?.provider_customer_id) return outra.provider_customer_id;

  const pagadorId = a.pagador_id ?? a.aluno_id;
  const { data: p } = await admin.from("profiles")
    .select("id,nome,email,whatsapp,cpf,responsavel_nome,responsavel_cpf,responsavel_whatsapp").eq("id", pagadorId).single();
  if (!p) throw new Error("perfil do pagador não encontrado");
  const usaResp = !!so(p.responsavel_cpf); // menor de idade: quem paga é o responsável
  const cpf = usaResp ? so(p.responsavel_cpf) : so(p.cpf);
  if (cpf.length !== 11 && cpf.length !== 14) throw new Error("CPF do aluno (ou do responsável) não cadastrado");

  const ja = await asaas("GET", `/customers?externalReference=${pagadorId}`);
  if (ja?.data?.length) return ja.data[0].id;
  const novo = await asaas("POST", "/customers", {
    name: usaResp ? p.responsavel_nome || p.nome : p.nome,
    cpfCnpj: cpf,
    email: p.email || undefined,
    mobilePhone: so(usaResp ? p.responsavel_whatsapp || p.whatsapp : p.whatsapp).replace(/^55(?=\d{10,11}$)/, "") || undefined,
    externalReference: pagadorId,
    notificationDisabled: false,
  });
  return novo.id;
}

async function criarAssinatura(a: any) {
  const cliente = await garantirCliente(a);
  const valor = (a.valor_centavos ?? a.planos.valor_centavos) / 100;
  const per = a.planos.periodicidade as string;
  const hoje = hojeFortaleza();
  let venc = somaMeses(hoje, 0, a.dia_vencimento);
  if (venc < hoje) venc = somaMeses(hoje, 1, a.dia_vencimento);
  // mês já cobrado no sistema (lançado à mão ou baixa manual): começa no ciclo seguinte
  const comp = venc.slice(0, 8) + "01";
  const { data: jaCobrado } = await admin.from("cobrancas").select("id").eq("assinatura_id", a.id).eq("competencia", comp).maybeSingle();
  if (jaCobrado) venc = somaMeses(venc, MESES[per] ?? 1, a.dia_vencimento);

  const s = await asaas("POST", "/subscriptions", {
    customer: cliente,
    billingType: "UNDEFINED",
    value: valor,
    nextDueDate: venc,
    cycle: CICLO[per] ?? "MONTHLY",
    description: `ZXT · ${a.planos.nome}`,
    externalReference: a.id,
  });
  await admin.from("assinaturas").update({
    provider: "asaas", provider_customer_id: cliente, provider_subscription_id: s.id,
    provider_status: "ATIVA", provider_erro: null, provider_sync_em: new Date().toISOString(),
  }).eq("id", a.id);
  return { assinatura: a.id, asaas: s.id, primeiro_vencimento: venc, valor };
}

async function cancelarAssinatura(a: any) {
  try { await asaas("DELETE", `/subscriptions/${a.provider_subscription_id}`); }
  catch (e: any) { if (e.status !== 404) throw e; }
  await admin.from("assinaturas").update({ provider_status: "CANCELADA", provider_erro: null, provider_sync_em: new Date().toISOString() }).eq("id", a.id);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return resp(200, { ok: true });
  if (!CHAVE) return resp(500, { erro: "ASAAS_API_KEY não configurada no Supabase" });

  // só admin
  const usuario = createClient(URL_SB, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } }, auth: { persistSession: false },
  });
  const { data: ehAdmin, error: eAdm } = await usuario.rpc("is_admin");
  if (eAdm || !ehAdmin) return resp(403, { erro: "Só a administração pode sincronizar com o Asaas" });

  let alunoId: string | null = null;
  try { alunoId = (await req.json())?.aluno_id ?? null; } catch { /* sem corpo = todos */ }

  const resultado = { ambiente: BASE.includes("sandbox") ? "sandbox" : "producao", criadas: [] as any[], canceladas: 0, erros: [] as any[] };

  let qAtivas = admin.from("assinaturas").select("*, planos(nome,valor_centavos,periodicidade), profiles!assinaturas_aluno_id_fkey(nome)")
    .eq("ativa", true).is("provider_subscription_id", null).not("plano_id", "is", null);
  let qFim = admin.from("assinaturas").select("id,aluno_id,provider_subscription_id")
    .eq("ativa", false).not("provider_subscription_id", "is", null).or("provider_status.is.null,provider_status.neq.CANCELADA");
  if (alunoId) { qAtivas = qAtivas.eq("aluno_id", alunoId); qFim = qFim.eq("aluno_id", alunoId); }

  const [{ data: ativas, error: e1 }, { data: encerradas, error: e2 }] = await Promise.all([qAtivas, qFim]);
  if (e1 || e2) return resp(500, { erro: (e1 || e2)!.message });

  for (const a of encerradas ?? []) {
    try { await cancelarAssinatura(a); resultado.canceladas++; }
    catch (e: any) { resultado.erros.push({ assinatura: a.id, erro: "cancelar: " + e.message }); }
  }
  for (const a of ativas ?? []) {
    try { resultado.criadas.push(await criarAssinatura(a)); }
    catch (e: any) {
      resultado.erros.push({ assinatura: a.id, aluno: a.profiles?.nome, erro: e.message });
      await admin.from("assinaturas").update({ provider_status: "ERRO", provider_erro: e.message, provider_sync_em: new Date().toISOString() }).eq("id", a.id);
    }
  }
  return resp(200, resultado);
});
