import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * Outbound transactional email.
 *
 * `log` is used when no email provider is configured.
 * It records only metadata and never logs recipients, email bodies,
 * password-reset links, or other sensitive information.
 *
 * `smtp` sends actual emails.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

async function sendViaLog(message: EmailMessage): Promise<void> {
  logger.info('Email not delivered: SMTP is not configured', {
    transport: 'log',
    subject: message.subject,
  });
}

async function sendViaSmtp(message: EmailMessage): Promise<void> {
  const { createTransport } = await import('nodemailer');

  const transport = createTransport({
    host: env.SMTP_HOST as string,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: {
      user: env.SMTP_USER as string,
      pass: env.SMTP_PASSWORD as string,
    },
  });

  await transport.sendMail({
    from: env.EMAIL_FROM as string,
    to: message.to,
    subject: message.subject,
    text: message.text,
  });
}

/**
 * Sends an email using the configured transport.
 */
export async function sendEmail(message: EmailMessage): Promise<void> {
  if (env.EMAIL_TRANSPORT === 'smtp') {
    await sendViaSmtp(message);
    logger.info('Email sent', {
      transport: 'smtp',
      subject: message.subject,
    });
    return;
  }

  await sendViaLog(message);
}
