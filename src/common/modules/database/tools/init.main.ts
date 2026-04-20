import { bootstrapTool } from './bootstrap-tool';

void bootstrapTool('init').catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
