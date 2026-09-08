import { env, isProduction } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * Outbound transactional email.
 *
 * Two transports are supported. `log` writes the message to the structured log
 * and is intended for local development, where standing up an SMTP account to
 * click a password-reset link is friction without value. `smtp` sends for real.
 *
 * Environment validation refuses to start a production server on the `log`
 * transport, so a deployment cannot silently swallow password resets.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

async function sendViaLog(message: EmailMessage): Promise<void> {
  // The recipient is intentionally included here: this transport exists so a
  // developer can read the link, and it never runs in production.
  logger.info('Email (log transport — not delivered)', {
    transport: 'log',
    to: message.to,
    subject: message.subject,
    body: message.text,
  });
}

async function sendViaSmtp(message: EmailMessage): Promise<void> {
  const { createTransport } = await import('nodemailer');

  const transport = createTransport({
    host: env.SMTP_HOST as string,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER as string, pass: env.SMTP_PASSWORD as string },
  });

  await transport.sendMail({
    from: env.EMAIL_FROM as string,
    to: message.to,
    subject: message.subject,
    text: message.text,
  });
}

/**
 * Sends a message, or throws if delivery fails.
 *
 * Callers decide whether a failure is fatal. Password reset deliberately does
 * not surface delivery failure to the requester, because doing so would reveal
 * whether the address is registered.
 */
export async function sendEmail(message: EmailMessage): Promise<void> {
  if (env.EMAIL_TRANSPORT === 'smtp') {
    await sendViaSmtp(message);
    logger.info('Email sent', { transport: 'smtp', subject: message.subject });
    return;
  }

  if (isProduction) {
    throw new Error('Refusing to use the log email transport in production');
  }

  await sendViaLog(message);
}
