import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { createEngramServer } from './server.js';

async function main() {
  const dbPath = process.env['ENGRAM_PATH'];
  const modelsDir = process.env['ENGRAM_MODELS_DIR'];

  const { server } = createEngramServer({ dbPath, modelsDir });
  const transport = new StdioServerTransport();

  await server.connect(transport);

  process.stderr.write('Engram MCP Server running on stdio\n');
}

main().catch((error) => {
  process.stderr.write(`Server error: ${error}\n`);
  process.exit(1);
});
