import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { activitiesResultSchema } from '../dist/activities.js';
import { loadApiKey } from '../dist/garmin.js';

const client = new Client({ name: 'garmin-live-check', version: '1.0.0' });
try {
  await client.connect(new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL('../dist/server.js', import.meta.url))],
    cwd: tmpdir(),
    env: { GARMIN_CONNECT_API_KEY: loadApiKey() },
    stderr: 'pipe',
  }));
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map(tool => tool.name), ['get_recent_activities']);
  const result = await client.callTool({ name: 'get_recent_activities', arguments: { limit: 3 } });
  if (result.isError) {
    process.stderr.write('A consulta real falhou. Verifique a chave, a conexão e o limite da Garmin.\n');
    process.exitCode = 1;
  } else {
    const parsed = activitiesResultSchema.safeParse(result.structuredContent);
    assert.equal(parsed.success, true, 'A resposta deve conter apenas os campos permitidos.');
    assert.deepEqual(JSON.parse(result.content[0].text), parsed.data);
    console.log(JSON.stringify(parsed.data, null, 2));
  }
} catch {
  process.stderr.write('Falha na verificação MCP. Nenhuma credencial ou resposta bruta foi exibida.\n');
  process.exitCode = 1;
} finally {
  await client.close();
}
