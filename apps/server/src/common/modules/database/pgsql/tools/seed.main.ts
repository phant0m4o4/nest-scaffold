import { bootstrapTool } from './bootstrap-tool';

void bootstrapTool('seed').catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
