import { json } from '@sveltejs/kit';
import { runPlaywrightBot } from '$lib/playwrightBot.js';

export async function POST({ request }) {
  const { url } = await request.json();
  if (!url) return json({ error: 'URL missing' }, { status: 400 });

  try {
    const result = await runPlaywrightBot(url);
    return json(result);
  } catch (e) {
    return json({ error: e.message }, { status: 500 });
  }
}
