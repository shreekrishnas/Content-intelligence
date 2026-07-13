import type { VercelRequest, VercelResponse } from '@vercel/node';

const ALLOWED_METHODS = 'GET, POST, OPTIONS';

export function cors(res: VercelResponse): void {
  const origin = process.env.SITE_URL || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', ALLOWED_METHODS);
  res.setHeader('Access-Control-Allow-Headers', 'authorization, x-account-id, x-client-info, apikey, content-type');
  if (origin !== '*') {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
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
