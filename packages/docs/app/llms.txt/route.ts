import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const revalidate = false;

export async function GET() {
  try {
    const llmsPath = join(process.cwd(), '..', 'toolkit', 'LLMS.md');
    const content = await readFile(llmsPath, 'utf-8');

    return new Response(content, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch {
    return new Response('Internal Server Error', { status: 500 });
  }
}
