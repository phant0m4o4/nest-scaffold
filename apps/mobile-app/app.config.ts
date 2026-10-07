import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Nest Scaffold',
  slug: 'nest-scaffold-mobile',
  version: '0.0.1',
  scheme: 'nest-scaffold',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  plugins: ['expo-router'],
  web: { bundler: 'metro', output: 'single' },
};

export default config;
