import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod/v4';
import { activitiesResultSchema } from './activities.js';
import { GarminActivitiesClient, GarminError, loadApiKey } from './garmin.js';

const client = new GarminActivitiesClient(loadApiKey());

serveStdio(() => {
  const server = new McpServer({ name: 'garmin-activities', version: '1.0.0' });
  server.registerTool('get_recent_activities', {
    description: 'Consulta as últimas atividades Garmin para relatório ao treinador. Retorna data, modalidade, duração, distância, calorias totais/de repouso/ativas, frequência cardíaca, efeito do treino e exercícios quando registrados. Não retorna localização, nomes livres, identificação, horário exato ou arquivos. Valores ausentes são null; calorias ativas são calculadas como total menos repouso. Dados de saúde estimados pela Garmin.',
    inputSchema: z.strictObject({ limit: z.number().int().min(1).max(50).default(10) }),
    outputSchema: activitiesResultSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, async ({ limit }) => {
    try {
      const result = await client.recentActivities(limit);
      return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: 'text', text: error instanceof GarminError
          ? error.message : 'Não foi possível consultar as atividades.' }],
      };
    }
  });
  return server;
});
