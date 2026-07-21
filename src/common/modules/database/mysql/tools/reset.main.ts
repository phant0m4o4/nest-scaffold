import { bootstrapTool } from './bootstrap-tool';

void bootstrapTool('reset').catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
