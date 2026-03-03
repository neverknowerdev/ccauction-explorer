import * as nodemailer from 'nodemailer';
import { NotificationChannel, UserSettings, NotificationPayload } from '../types';

// SMTP config from environment
const smtpHost = process.env.SMTP_HOST;
const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;

let transporter: nodemailer.Transporter | null = null;

if (smtpHost && smtpUser) {
  transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465, // true for 465, false for other ports
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });
}

export class EmailChannel implements NotificationChannel {
  async send(settings: UserSettings, payload: NotificationPayload): Promise<boolean> {
    if (!settings.email || !transporter) {
      if (!transporter) console.warn('Email: SMTP not configured');
      return false;
    }

    try {
      await transporter.sendMail({
        from: '"CCAuction Explorer" <no-reply@ccauction.com>',
        to: settings.email,
        subject: payload.title,
        text: `${payload.body}\n\nView details: ${payload.url}`,
        html: `
          <div style="font-family: sans-serif; padding: 20px; background: #f4f4f4;">
            <div style="background: white; padding: 20px; border-radius: 8px;">
              <h2 style="color: #6366f1;">${payload.title}</h2>
              <p style="font-size: 16px;">${payload.body}</p>
              <a href="${payload.url}" style="display: inline-block; padding: 10px 20px; background: #6366f1; color: white; text-decoration: none; border-radius: 5px; margin-top: 10px;">View Auction</a>
            </div>
          </div>
        `,
      });
      return true;
    } catch (error) {
      console.error('Email Error:', error);
      return false;
    }
  }
}
