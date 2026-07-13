import type { VercelRequest, VercelResponse } from '@vercel/node';

export function cors(res: VercelResponse): void {
  const origin = process.env.SITE_URL || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type');
}

export function handleOptions(req: VercelRequest, res: VercelResponse): boolean {
  cors(res);
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }
  return false;
}

export function sendError(res: VercelResponse, status: number, code: string, message: string): void {
  res.status(status).json({ error: message, code });
}
