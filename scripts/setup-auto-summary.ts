import { pathToFileURL } from 'node:url';
import { INDEX_NAME } from '../lib/contract.ts';
import { createElasticClient } from '../lib/elastic.ts';
import {
  AUTO_SUMMARY_INFERENCE_ID, AUTO_SUMMARY_PIPELINE, DEFAULT_SUMMARY_MODEL, autoSummaryMappings, autoSummaryPipeline,
} from '../lib/auto-summary.ts';

export async function main(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY must be set; it is stored only inside the Elastic inference endpoint');
  const model = process.env.OPENAI_SUMMARY_MODEL || DEFAULT_SUMMARY_MODEL;
  const replace = process.argv.includes('--replace-endpoint');
  const client = createElasticClient();
  try {
    const existing = await client.inference.get({ inference_id: AUTO_SUMMARY_INFERENCE_ID }).then(() => true, () => false);
    if (existing && replace) await client.inference.delete({ inference_id: AUTO_SUMMARY_INFERENCE_ID, task_type: 'completion', force: true });
    if (!existing || replace) {
      await client.inference.put({
        task_type: 'completion', inference_id: AUTO_SUMMARY_INFERENCE_ID,
        inference_config: { service: 'openai', service_settings: { api_key: apiKey, model_id: model } },
      });
      console.log(`Created inference endpoint ${AUTO_SUMMARY_INFERENCE_ID} with OpenAI model ${model}.`);
    } else console.log(`Inference endpoint ${AUTO_SUMMARY_INFERENCE_ID} already exists; pass --replace-endpoint to change its key or model.`);
    const check = await client.inference.completion({ inference_id: AUTO_SUMMARY_INFERENCE_ID, input: 'Reply with the word ready.' });
    console.log(`Endpoint check returned ${check.completion.length} completion.`);
    await client.indices.putMapping({ index: INDEX_NAME, properties: autoSummaryMappings });
    console.log(`Added mappings for ${Object.keys(autoSummaryMappings).join(', ')} to ${INDEX_NAME} (additive; existing fields unchanged).`);
    await client.ingest.putPipeline({ id: AUTO_SUMMARY_PIPELINE, ...autoSummaryPipeline(model) });
    console.log(`Saved ingest pipeline ${AUTO_SUMMARY_PIPELINE}.`);
  } finally { await client.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    let message = error instanceof Error ? error.message : 'Unknown error';
    for (const value of [process.env.ES_URL, process.env.ES_API_KEY, process.env.OPENAI_API_KEY]) if (value) message = message.split(value).join('[redacted]');
    console.error(`Auto-summary setup failed: ${message}`);
    process.exitCode = 1;
  });
}
