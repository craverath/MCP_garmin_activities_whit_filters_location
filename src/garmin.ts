import { sanitizeActivity, type ActivitiesResult } from './activities.js';

const baseUrl = 'https://personal.connectapi.garmin.com';
export const activitiesPath = '/activitylist-service/activities/search/activities';
const tokenPath = '/personalapitoken-service/personal-api/personal-api-key/token';

export class GarminError extends Error {}

/** The only required configuration is the Garmin Personal API key. */
export function loadApiKey(environment: NodeJS.ProcessEnv = process.env): string {
  const key = environment.GARMIN_CONNECT_API_KEY;
  if (!key || !/^[\x21-\x7e]+$/.test(key)) {
    throw new GarminError('Defina a variável de ambiente GARMIN_CONNECT_API_KEY com sua chave da Garmin Personal API.');
  }
  return key;
}

function checkStatus(response: Response, stage: string): void {
  if (response.ok) return;
  if (response.status === 401 || response.status === 403) {
    throw new GarminError('A Garmin recusou a credencial. Confira a validade da chave no Garmin Connect.');
  }
  if (response.status === 429) {
    throw new GarminError('Limite de consultas da Garmin atingido. Aguarde antes de tentar novamente.');
  }
  // Upstream bodies and exceptions may contain private data or credentials.
  throw new GarminError(`Falha na ${stage} da Garmin (HTTP ${response.status}).`);
}

/** Access only token issuance and the fixed activity-list endpoint. Tokens stay in memory. */
export class GarminActivitiesClient {
  private token: string | undefined;
  private tokenExpiresAt = 0;

  constructor(private readonly apiKey: string, private readonly request: typeof fetch = fetch) {}

  private async accessToken(): Promise<string> {
    if (this.token && Date.now() < this.tokenExpiresAt) return this.token;
    const response = await this.request(baseUrl + tokenPath, {
      method: 'POST',
      headers: { Authorization: `ApiKey ${this.apiKey}` },
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
    });
    checkStatus(response, 'autenticação');
    // This endpoint returns a plain-text JWT, not JSON.
    const token = (await response.text()).trim();
    if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) {
      throw new GarminError('A Garmin retornou um token em formato inesperado.');
    }
    let expiration: unknown;
    try {
      expiration = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString()).exp;
    } catch {
      throw new GarminError('A Garmin retornou um token em formato inesperado.');
    }
    if (typeof expiration !== 'number' || !Number.isFinite(expiration) || expiration * 1000 <= Date.now()) {
      throw new GarminError('A Garmin retornou um token sem validade utilizável.');
    }
    this.token = token;
    this.tokenExpiresAt = expiration * 1000 - 60_000;
    return token;
  }

  async recentActivities(limit = 10): Promise<ActivitiesResult> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      throw new GarminError('O limite deve ser um número inteiro entre 1 e 50.');
    }
    try {
      const token = await this.accessToken();
      const query = new URLSearchParams({
        start: '0', limit: String(limit), sortBy: 'startLocal',
        sortOrder: 'desc', excludeChildren: 'true',
      });
      const response = await this.request(`${baseUrl}${activitiesPath}?${query}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(20_000),
      });
      if (response.status === 401 || response.status === 403) {
        this.token = undefined;
        this.tokenExpiresAt = 0;
      }
      checkStatus(response, 'consulta de atividades');
      const data: unknown = await response.json();
      if (!Array.isArray(data) || data.some(item => item === null || typeof item !== 'object' || Array.isArray(item))) {
        throw new GarminError('A Garmin retornou uma lista de atividades em formato inesperado.');
      }
      return { activities: data.slice(0, limit).map(sanitizeActivity) };
    } catch (error) {
      if (error instanceof GarminError) throw error;
      throw new GarminError('Não foi possível consultar a Garmin. Confira a conexão e tente novamente.');
    }
  }
}
