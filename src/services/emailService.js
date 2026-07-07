import { Resend } from 'resend';
import config from '#config.js';

let resendClient;

function getResendClient() {
  if (!resendClient) {
    resendClient = new Resend(config.resend.apiKey);
  }
  return resendClient;
}

export async function sendPasswordResetEmail(to, url) {
  const subject = 'Reset your password';
  const html = `
  <p>Click below to reset your password.</p>
  <a href="${url}">Reset Password</a>
  `;

  if (!config.resend.apiKey) {
    throw new Error('RESEND_API_KEY is not configured');
  }
  if (!config.resend.fromEmail) {
    throw new Error('RESEND_FROM_EMAIL is not configured');
  }

  const { error } = await getResendClient().emails.send({
    from: config.resend.fromEmail,
    to: [to],
    subject,
    html,
  });

  if (error) {
    throw new Error(error.message || 'Failed to send email via Resend');
  }
}
