import assert from 'node:assert/strict';
import test from 'node:test';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

test('stdio MCP exposes only the activity tool and rejects arbitrary routes before calling Garmin', async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL('../dist/server.js', import.meta.url))],
    cwd: tmpdir(),
    env: { GARMIN_CONNECT_API_KEY: 'synthetic-test-key' },
    stderr: 'pipe',
  });
  const client = new Client({ name: 'garmin-test', version: '1.0.0' });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map(tool => tool.name), ['get_recent_activities']);
    assert.equal(tools[0].annotations.readOnlyHint, true);
    for (const args of [{ limit: 0 }, { limit: 51 }, { limit: 1, path: '/userprofile-service/userprofile/settings' }]) {
      const result = await client.callTool({ name: 'get_recent_activities', arguments: args });
      assert.equal(result.isError, true);
    }
  } finally {
    await client.close();
  }
});
