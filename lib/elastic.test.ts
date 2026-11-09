import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElasticClient, indexSessions, sessionsMapping } from './elastic.ts';
import { parseSessionize } from './parse-sessionize.ts';
import { readFileSync } from 'node:fs';
import { Client } from '@elastic/elasticsearch';
const sessions = () => parseSessionize(readFileSync(new URL('./__fixtures__/schedule.md', import.meta.url), 'utf8'));
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe('Elastic ingestion', () => {
  it('requires both credentials without leaking their values', () => {
    vi.stubEnv('ES_URL', ''); vi.stubEnv('ES_API_KEY', 'secret-value');
    expect(() => createElasticClient()).toThrow('ES_URL and ES_API_KEY must both be set');
    vi.stubEnv('ES_URL', 'http://localhost:9200'); vi.stubEnv('ES_API_KEY', '');
    expect(() => createElasticClient()).toThrow('ES_URL and ES_API_KEY must both be set');
  });
  it('defines explicit lexical, semantic, date, and speaker mappings', () => {
    expect(sessionsMapping).toMatchObject({ properties: {
      title: {type:'text',fields:{keyword:{type:'keyword'}}},
      description:{type:'text',copy_to:'description_semantic'}, description_semantic:{type:'semantic_text'},
      startsAt:{type:'date'}, endsAt:{type:'date'}, speakers:{properties:{name:{type:'keyword'},company:{type:'keyword'}}},
      restrictions:{type:'keyword'}, venue:{type:'keyword'}, level:{type:'keyword'},
    }});
  });
  it('creates mappings and indexes with Sessionize IDs, then confirms the count', async () => {
    const client = new Client({node:'http://localhost:9200'});
    vi.spyOn(client.indices,'exists').mockResolvedValue(false);
    const create = vi.spyOn(client.indices,'create').mockResolvedValue({acknowledged:true,shards_acknowledged:true,index:'sessions'});
    const bulk = vi.spyOn(client,'bulk').mockResolvedValue({errors:false,took:15,items:[]});
    vi.spyOn(client,'count').mockResolvedValue({count:6,_shards:{total:1,successful:1,failed:0}});
    expect(await indexSessions(client,sessions())).toBe(6);
    expect(create).toHaveBeenCalledWith({index:'sessions',mappings:sessionsMapping});
    expect(bulk.mock.calls[0]?.[0]).toMatchObject({operations:[{index:{_index:'sessions',_id:'1379082'}},...sessions().slice(0,1),...sessions().slice(1).flatMap(s => [{index:{_index:'sessions',_id:s.id}},s])]});
  });
  it('refuses an existing index unless recreation is explicit', async () => {
    const client = new Client({node:'http://localhost:9200'});
    vi.spyOn(client.indices,'exists').mockResolvedValue(true);
    await expect(indexSessions(client,sessions())).rejects.toThrow(/--recreate/);
  });
  it('fails for an individual failed bulk item even if the top-level flag is false', async () => {
    const client = new Client({node:'http://localhost:9200'});
    vi.spyOn(client.indices,'exists').mockResolvedValue(false);
    vi.spyOn(client.indices,'create').mockResolvedValue({acknowledged:true,shards_acknowledged:true,index:'sessions'});
    vi.spyOn(client,'bulk').mockResolvedValue({errors:false,took:2,items:[{index:{_index:'sessions',_id:'1379082',status:429,error:{type:'too_many_requests',reason:'inference busy'}}}]});
    await expect(indexSessions(client,sessions())).rejects.toThrow(/1379082.*429/);
  });
});

it('recreates only when requested and verifies the final document count', async () => {
  const client = new Client({node:'http://localhost:9200'});
  vi.spyOn(client.indices,'exists').mockResolvedValue(true);
  const remove = vi.spyOn(client.indices,'delete').mockResolvedValue({acknowledged:true});
  vi.spyOn(client.indices,'create').mockResolvedValue({acknowledged:true,shards_acknowledged:true,index:'sessions'});
  vi.spyOn(client,'bulk').mockResolvedValue({errors:false,took:15,items:[]});
  vi.spyOn(client,'count').mockResolvedValue({count:5,_shards:{total:1,successful:1,failed:0}});
  await expect(indexSessions(client,sessions(),true)).rejects.toThrow('Count mismatch: expected 6, found 5');
  expect(remove).toHaveBeenCalledWith({index:'sessions'});
});
