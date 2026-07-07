import { getTokenProvider } from '@aws/bedrock-token-generator';
import config from '#config.js';

const provideToken = getTokenProvider({
  region: config.awsRegion,
  expiresInSeconds: config.bedrockTokenExpiresSeconds,
});

export async function getAuthorizationHeader() {
  const token = await provideToken();
  return `Bearer ${token}`;
}
