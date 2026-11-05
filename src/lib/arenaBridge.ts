// Connects the Limit Arena iframe to Supabase. The game has no session or keys of
// its own: it posts a request here, and only these three RPCs can be reached.
export const ARENA_GAME_SOURCE = 'limit-arena';
export const ARENA_HOST_SOURCE = 'limit-arena-host';

export interface ArenaRequest {
  source: typeof ARENA_GAME_SOURCE;
  id: number;
  action: string;
  payload?: Record<string, unknown>;
}

export type ArenaRpc = (
  name: string,
  args?: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: unknown }>;

export function isArenaRequest(message: unknown): message is ArenaRequest {
  const m = message as ArenaRequest | null;
  return !!m && m.source === ARENA_GAME_SOURCE && Number.isInteger(m.id) && typeof m.action === 'string';
}

async function runAction(rpc: ArenaRpc, action: string, payload: Record<string, unknown> = {}) {
  const call = async (name: string, args?: Record<string, unknown>) => {
    const { data, error } = await rpc(name, args);
    if (error) throw error;
    return data;
  };
  switch (action) {
    case 'catalog':
      return call('arena_catalog');
    case 'next':
      return call('arena_next_question', {
        _run_id: payload.runId,
        _units: payload.units,
        _current_unit: payload.currentUnit,
        _tier: payload.tier,
        _prefer_current: payload.preferCurrent,
      });
    case 'answer':
      return call('arena_submit_answer', { _issue_id: payload.issueId, _selected: payload.index });
    default:
      throw new Error('Unknown arena action');
  }
}

export async function replyToArenaRequest(rpc: ArenaRpc, request: ArenaRequest) {
  try {
    const data = await runAction(rpc, request.action, request.payload);
    return { source: ARENA_HOST_SOURCE, id: request.id, ok: true, data };
  } catch {
    return { source: ARENA_HOST_SOURCE, id: request.id, ok: false };
  }
}
