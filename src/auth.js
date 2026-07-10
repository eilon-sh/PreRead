import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import config from '#config.js';
import prisma from '#db/prisma.js';
import { sendPasswordResetEmail } from '#services/emailService.js';

const socialProviders = config.google.enabled
  ? {
      google: {
        clientId: config.google.clientId,
        clientSecret: config.google.clientSecret,
      },
    }
  : undefined;

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  secret: config.betterAuthSecret,
  baseURL: config.betterAuthUrl,
  trustedOrigins: [config.betterAuthUrl],
  advanced: {
    useSecureCookies: config.isHttps,
  },
  emailAndPassword: {
    enabled: true,
    sendResetPassword: async ({ user, url }) => {
      await sendPasswordResetEmail(user.email, url);
    },
    revokeSessionsOnPasswordReset: true,
  },
  socialProviders,
});
