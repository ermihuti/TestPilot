// src/routes/api/analyze/+server.js
import { json } from '@sveltejs/kit';
import { runPlaywrightBot } from '$lib/playwrightBot.js';

export async function POST({ request }) {
  const { url } = await request.json();
  if (!url) return json({ error: 'URL missing' }, { status: 400 });

  try {
    console.log('Analyzing:', url);
    const result = await runPlaywrightBot(url);
    return json(result);
  } catch (e) {
    console.error('Analysis error:', e);
    return json({ error: e.message }, { status: 500 });
  }
}

// Optional: explicitly disallow GET
export function GET() {
  return new Response('Method Not Allowed', { status: 405 });
}