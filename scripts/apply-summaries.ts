import { pathToFileURL } from 'node:url';
import { createElasticClient } from '../lib/elastic.ts';
import { applySummaryUpdates, loadSummaries } from '../lib/summaries.ts';

export async function main(): Promise<void> {
  const summaries = await loadSummaries();
  const client = createElasticClient();
  try {
    const { updated, failed } = await applySummaryUpdates(request => client.update({ ...request, refresh: 'wait_for' }), summaries);
    console.log(`Applied ${updated.length}/${Object.keys(summaries).length} summaries with partial updates; no documents were created, replaced, or deleted.`);
    if (failed.length) throw new Error(`Summary updates failed: ${failed.map(item => `${item.id} (${item.reason})`).join('; ')}`);
  } finally { await client.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    let message = error instanceof Error ? error.message : 'Unknown error';
    for (const value of [process.env.ES_URL, process.env.ES_API_KEY]) if (value) message = message.split(value).join('[redacted]');
    console.error(`Apply summaries failed: ${message}`);
    process.exitCode = 1;
  });
}
