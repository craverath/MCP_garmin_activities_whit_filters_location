# Garmin Activities MCP

MCP simples, somente de leitura, para consultar as últimas atividades do Garmin
Connect e preparar registros para um treinador, sem compartilhar localização.

**Configuração obrigatória: apenas `GARMIN_CONNECT_API_KEY`, com a chave da
Garmin Personal API.** O MCP gera e renova os tokens de acesso automaticamente.
Não precisa de usuário, senha, client ID, client secret ou outra variável.

## Instalação

Requer Node.js 22 ou superior, npm e um cliente MCP que execute processos locais
via `stdio`.

1. Clone na máquina do bot: `git clone https://github.com/craverath/MCP_garmin_activities_whit_filters_location.git garmin-activities-mcp`.
2. Entre na pasta `garmin-activities-mcp` e execute `npm ci`.
3. Execute `npm run build`.
4. Configure o MCP no seu cliente conforme o exemplo abaixo.
5. Peça: “Busque minhas últimas 10 atividades e prepare um registro para meu treinador”.

```json
{
  "mcpServers": {
    "garmin-activities": {
      "command": "node",
      "args": ["/CAMINHO/garmin-activities-mcp/dist/server.js"],
      "env": {
        "GARMIN_CONNECT_API_KEY": "SUA_CHAVE_GARMIN"
      }
    }
  }
}
```

Substitua o caminho pelo local da instalação e forneça a chave na variável de
ambiente do processo MCP. O formato do arquivo de configuração e a forma de
injetar segredos dependem do cliente. Se ele tiver um gerenciador de segredos,
use-o para preencher essa mesma variável. Não coloque a chave no Git.

Para iniciar diretamente pelo terminal:

```sh
export GARMIN_CONNECT_API_KEY="SUA_CHAVE_GARMIN"
node dist/server.js
```

O servidor usa entrada e saída padrão para o protocolo MCP; não abre uma URL
pública. Não lê arquivos `.env` automaticamente e não depende de outro
repositório. Se preferir um `.env` local, carregue-o explicitamente com
`node --env-file=.env dist/server.js`. O nome da variável usa `_`, inclusive
entre `API` e `KEY`: `GARMIN_CONNECT_API_KEY`.

## Única ferramenta

`get_recent_activities`

```json
{ "limit": 10 }
```

O limite é um inteiro de 1 a 50; o padrão é 10. As atividades vêm da mais recente
para a mais antiga. Atividades filhas de uma atividade multiesporte são
excluídas para evitar duplicar o registro da sessão.

## Somente estes dados são retornados

O resultado contém apenas o objeto `activities`, com uma lista de atividades.
Cada atividade permite exclusivamente os campos abaixo:

| Campo | Conteúdo |
| --- | --- |
| `date`, `sport` | Data sem horário e código da modalidade registrado pela Garmin |
| `durationMinutes`, `distanceKm` | Duração em minutos e distância em quilômetros |
| `calories` | `totalKcal`, `restingKcal` e `activeKcal` durante a atividade |
| `heartRateBpm`, `trainingEffect`, `intensityMinutes` | FC `average`/`maximum`; efeito `aerobic`/`anaerobic`; minutos `moderate`/`vigorous` |
| `sets`, `repetitions`, `exercises` | Totais de séries/repetições e detalhes dos exercícios registrados |

Em `exercises`, os únicos campos são `category`, `exercise`, `sets`,
`repetitions`, `durationMinutes` e `maximumWeightKg`.

Calorias ativas são calculadas como `calories - bmrCalories` da Garmin. As
calorias totais da atividade incluem o repouso durante a sessão. Se algum valor
estiver ausente ou o repouso exceder o total, `activeKcal` fica `null`.
O resultado não inclui o gasto calórico do restante do dia.

Valores ausentes ficam `null`; exercícios ausentes ficam em uma lista vazia.
Modalidades e exercícios usam códigos da Garmin, como `hiit`, `indoor_cycling`
e `BENCH_PRESS`. Os exercícios refletem o que foi registrado pelo relógio,
inclusive eventuais erros de reconhecimento automático.

## Dados excluídos e limites

- Não retorna latitude, longitude, percurso, local, fuso horário, horário exato,
  nome livre da atividade, descrição, comentários, fotos, identificação da conta
  ou de pessoas, números de série e arquivos FIT.
- Não consulta sono, peso, alimentação, ciclo menstrual, perfil ou outras rotas.
  Usa somente a autenticação e a listagem de atividades da Personal API.
- A resposta original da Garmin pode incluir localização. Ela é recebida apenas
  em memória; o MCP constrói uma resposta nova com os campos permitidos e valida
  seu esquema. Campos extras ou novos não são repassados automaticamente.
- Chave e tokens ficam na memória do processo. Não há cache em disco, gravação
  das atividades ou logs de respostas brutas. Erros externos são substituídos
  por mensagens controladas. O filtro não reduz as permissões originais da chave.
- O MCP só entrega os dados ao cliente. Não envia mensagens ao treinador nem
  grava registros automaticamente. As métricas continuam sendo dados de saúde.

## Testes

```sh
npm test
```

Compila o projeto e testa configuração por uma variável, privacidade, conversões,
calorias, rotas permitidas, proteção de erros e comunicação pelo protocolo MCP.
Os testes usam dados sintéticos e não precisam de chave real.

Com `GARMIN_CONNECT_API_KEY` configurada, valide a instalação com a conta real:

```sh
npm run test:live
```

Esse comando consulta três atividades através do MCP e imprime somente os
campos permitidos. Não salva os dados em arquivos.

## Documentação oficial

- [Swagger da Garmin Personal API](https://developer.garmin.com/gc-developer-program/personal/swagger-docs/)
- [Criar chave e obter token](https://developer.garmin.com/gc-developer-program/personal/personal-api/)
- [Validade e revogação de chaves](https://developer.garmin.com/gc-developer-program/personal/personal-faq/)
- [Definições de calorias da Garmin](https://support.garmin.com/en-CA/?faq=lkl4cwCLlK7ox362uGQEV7)
- [SDK oficial MCP](https://ts.sdk.modelcontextprotocol.io/v2/)
