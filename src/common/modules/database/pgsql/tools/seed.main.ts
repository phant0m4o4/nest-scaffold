import { bootstrapTool } from './bootstrap-tool';

void bootstrapTool().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
