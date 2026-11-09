import { Client } from '@elastic/elasticsearch';
import type { estypes } from '@elastic/elasticsearch';
import type { Session } from './contract.ts';

export const sessionsMapping: estypes.MappingTypeMapping = {
  properties: {
    id: {type:'keyword'}, eventId: {type:'keyword'},
    title: {type:'text',fields:{keyword:{type:'keyword'}}},
    description: {type:'text',copy_to:'description_semantic'},
    description_semantic: {type:'semantic_text'},
    speakers: {type:'object',properties:{name:{type:'keyword'},company:{type:'keyword'}}},
    startsAt: {type:'date'}, endsAt: {type:'date'}, day: {type:'keyword'},
    room: {type:'keyword'}, roomType: {type:'keyword'}, venue: {type:'keyword'}, level: {type:'keyword'},
    kind: {type:'keyword'}, restrictions: {type:'keyword'}, crowdEstimate: {type:'keyword'},
    crowdBasis: {type:'keyword'}, noiseEstimate: {type:'keyword'}, noiseBasis: {type:'keyword'}, captions: {type:'keyword'},
    plainSummary: {type:'text'}, summarySource: {type:'keyword'}, sourceUrl: {type:'keyword'},
  },
};

export function createElasticClient(): Client {
  const { ES_URL, ES_API_KEY } = process.env;
  if (!ES_URL || !ES_API_KEY) throw new Error('ES_URL and ES_API_KEY must both be set');
  return new Client({node:ES_URL,auth:{apiKey:ES_API_KEY},requestTimeout:180_000,maxRetries:0});
}

export async function indexSessions(client: Client, sessions: Session[], recreate = false): Promise<number> {
  if (!sessions.length) throw new Error('No sessions selected; index was not changed');
  if (await client.indices.exists({index:'sessions'})) {
    if (!recreate) throw new Error('Index sessions already exists. Pass --recreate to replace it.');
    console.log('Recreating sessions: deleting the existing index and its documents.');
    await client.indices.delete({index:'sessions'});
  }
  await client.indices.create({index:'sessions',mappings:sessionsMapping});
  const started = performance.now();
  let serverMs = 0;
  for (let offset = 0; offset < sessions.length; offset += 40) {
    const batch = sessions.slice(offset, offset + 40);
    const result = await client.bulk({
      operations: batch.flatMap(session => [{index:{_index:'sessions',_id:session.id}}, session]),
      refresh: true,
    });
    serverMs += result.took;
    const failures = result.items.flatMap(item => Object.values(item)).filter(item => item.status >= 300 || item.error);
    if (result.errors || failures.length) {
      throw new Error(`Bulk indexing failed: ${failures.map(item => `${item._id} status ${item.status} ${item.error?.type ?? ''}`).join('; ')}`);
    }
    console.log(`Indexed ${Math.min(offset + batch.length, sessions.length)}/${sessions.length}`);
  }
  const {count} = await client.count({index:'sessions'});
  if (count !== sessions.length) throw new Error(`Count mismatch: expected ${sessions.length}, found ${count}`);
  console.log(`Confirmed ${count} indexed; bulk/inference wall time ${((performance.now()-started)/1000).toFixed(2)}s; Elastic bulk took ${(serverMs/1000).toFixed(2)}s (includes inference).`);
  return count;
}
