// Fetches a calendar link (.ics) for Smart Calendar, which a browser can't do itself because
// calendar servers like Canvas don't allow other sites to read their feeds.
//
// Only signed-in users can use it, and it only fetches public https calendar links, so it can't
// be used as an open proxy. Deploy it from the Supabase dashboard (Edge Functions → Deploy a new
// function → name it fetch-feed) or with `supabase functions deploy fetch-feed`.

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 15_000;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function reply(status: number, body: string, type = 'text/plain; charset=utf-8') {
  return new Response(body, { status, headers: { ...cors, 'Content-Type': type } });
}

/** Public https hosts only: no IP addresses, localhost or internal names. */
function allowed(url: URL): boolean {
  if (url.protocol !== 'https:' || url.username || url.password) return false;
  if (url.port && url.port !== '443') return false;
  const host = url.hostname.toLowerCase();
  if (!host.includes('.') || host.startsWith('[')) return false;
  if (/^\d+(\.\d+){3}$/.test(host)) return false;
  return !/(^|\.)(localhost|local|internal|localdomain|home|lan|intranet|corp)$/.test(host);
}

async function signedIn(req: Request): Promise<boolean> {
  const auth = req.headers.get('Authorization') ?? '';
  const apikey = Deno.env.get('SUPABASE_ANON_KEY') ?? req.headers.get('apikey') ?? '';
  const base = Deno.env.get('SUPABASE_URL');
  if (!auth.startsWith('Bearer ') || !base) return false;
  const res = await fetch(`${base}/auth/v1/user`, { headers: { Authorization: auth, apikey } });
  return res.ok;
}

async function readCapped(res: Response): Promise<string | null> {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, 'Use POST.');
  if (!(await signedIn(req))) return reply(401, 'Sign in to use calendar links.');

  let target: URL;
  try {
    const { url } = (await req.json()) as { url?: unknown };
    target = new URL(String(url).replace(/^webcals?:\/\//i, 'https://'));
  } catch {
    return reply(400, "That isn't a calendar link.");
  }

  const signal = AbortSignal.timeout(TIMEOUT_MS);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!allowed(target)) return reply(400, 'Only public https calendar links can be added.');
    let res: Response;
    try {
      res = await fetch(target, { redirect: 'manual', signal, headers: { Accept: 'text/calendar, */*' } });
    } catch {
      return reply(502, "Couldn't reach that calendar link.");
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get('Location')) {
      target = new URL(res.headers.get('Location')!, target);
      continue;
    }
    if (!res.ok) return reply(502, `That calendar link answered with an error (${res.status}).`);
    const text = await readCapped(res);
    if (text === null) return reply(413, 'That calendar is too big.');
    if (!text.trimStart().startsWith('BEGIN:VCALENDAR')) return reply(422, "That link isn't a calendar (.ics) feed.");
    return reply(200, text, 'text/calendar; charset=utf-8');
  }
  return reply(502, 'That calendar link redirects too many times.');
});
