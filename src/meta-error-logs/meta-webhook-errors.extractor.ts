/**
 * Extrai de um webhook de ENTRADA da Meta os erros que nenhuma resposta HTTP
 * revela.
 *
 * Metade das falhas da Cloud API é assíncrona: o `POST /messages` responde 200
 * com um `wamid`, e a recusa chega segundos depois, num webhook de status:
 *
 * ```json
 * {"statuses":[{"id":"wamid.HBgM…","status":"failed","recipient_id":"5535…",
 *   "errors":[{"code":131053,"title":"Media upload error","error_data":{
 *     "details":"Video file has size 63787247 bytes but must be atmost 16777216 bytes and non-empty"}}]}]}
 * ```
 *
 * `logs_erros_meta` nasceu cobrindo só o caminho de SAÍDA, então um erro desses
 * não era persistido nem ganhava chave de busca — o detalhe (o número de bytes,
 * que é a informação inteira) vivia só numa linha de log.
 *
 * O extrator é PURO e defensivo: o payload vem da internet e pode ter qualquer
 * forma. Qualquer nó fora do formato esperado é ignorado em silêncio, nunca
 * lança.
 */

/** Um erro encontrado no payload, pronto para persistir. */
export interface ErroDeWebhook {
  /** `wamid` da mensagem recusada, quando o erro vier de um `statuses[]`. */
  referencia?: string;
  /** Código numérico da Meta (131053, 131049, …), quando presente. */
  codigo?: number;
  /** Linha curta para o log: `131053 Media upload error — Video file has size…`. */
  resumo: string;
  /** O nó inteiro, sem truncar: o `statuses[]` completo ou o erro cru. */
  corpo: unknown;
  /** `entry[].id` — id da WABA que originou o evento. */
  wabaId?: string;
  /** `value.metadata.phone_number_id`. */
  pid?: string;
}

const ehObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const texto = (v: unknown): string | undefined =>
  typeof v === 'string' && v.length > 0 ? v : undefined;

const numero = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

/**
 * Monta o resumo de uma linha. O `error_data.details` é o campo que vale: o
 * `title` e o `message` costumam ser o mesmo rótulo genérico ("Media upload
 * error"), enquanto o `details` traz o número que explica a recusa.
 */
function resumirErro(erro: Record<string, unknown>): string {
  const codigo = numero(erro['code']);
  const titulo = texto(erro['title']) ?? texto(erro['message']);
  const dados = ehObjeto(erro['error_data']) ? erro['error_data'] : undefined;
  const detalhe = dados ? texto(dados['details']) : undefined;

  const partes = [
    codigo !== undefined ? String(codigo) : undefined,
    titulo,
    detalhe,
  ].filter((p): p is string => !!p);

  return partes.length > 0 ? partes.join(' — ') : 'erro da Meta sem descrição';
}

function coletarErros(
  node: Record<string, unknown>,
  contexto: { referencia?: string; wabaId?: string; pid?: string },
  saida: ErroDeWebhook[],
): void {
  const erros = node['errors'];
  if (!Array.isArray(erros)) return;

  for (const bruto of erros) {
    if (!ehObjeto(bruto)) continue;
    saida.push({
      ...contexto,
      codigo: numero(bruto['code']),
      resumo: resumirErro(bruto),
      // O nó INTEIRO, não só o erro: o `statuses[]` carrega o wamid, o
      // destinatário e o timestamp, e é isso que liga o registro à mensagem.
      corpo: node,
    });
  }
}

/**
 * Varre o payload e devolve um item por erro encontrado. Lista vazia é o caso
 * normal — a esmagadora maioria dos webhooks não traz erro nenhum, e esta função
 * roda em todos eles.
 */
export function extrairErrosDeWebhook(
  payload: Record<string, unknown>,
): ErroDeWebhook[] {
  const saida: ErroDeWebhook[] = [];

  const entries = payload['entry'];
  if (!Array.isArray(entries)) return saida;

  for (const entry of entries) {
    if (!ehObjeto(entry)) continue;
    const wabaId = texto(entry['id']);

    const changes = entry['changes'];
    if (!Array.isArray(changes)) continue;

    for (const change of changes) {
      if (!ehObjeto(change)) continue;
      const value = change['value'];
      if (!ehObjeto(value)) continue;

      const metadata = ehObjeto(value['metadata'])
        ? value['metadata']
        : undefined;
      const pid = metadata ? texto(metadata['phone_number_id']) : undefined;

      // 1. Falha de entrega de uma mensagem específica — o caso do 131053.
      const statuses = value['statuses'];
      if (Array.isArray(statuses)) {
        for (const status of statuses) {
          if (!ehObjeto(status)) continue;
          coletarErros(
            status,
            { referencia: texto(status['id']), wabaId, pid },
            saida,
          );
        }
      }

      // 2. Erro de nível conta/WABA, sem mensagem associada.
      coletarErros(value, { wabaId, pid }, saida);
    }
  }

  return saida;
}
