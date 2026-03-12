import { config } from './jest.config';
export default {
  ...config,
  testRegex: '.e2e-spec.ts$',
};
