import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string; // plain-text fallback
  attachments?: EmailAttachment[];
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  transport: string; // "gmail" | "smtp" | "disabled"
}

export class EmailTransportService {
  private transporter: Transporter | null = null;
  private transportType: string;

  constructor() {
    this.transportType = env.EMAIL_TRANSPORT;

    if (!env.EMAIL_SEND_ENABLED || this.transportType === "disabled") {
      this.transportType = "disabled";
      logger.info("Email transport: DISABLED (preview only)");
      return;
    }

    if (this.transportType === "gmail") {
      if (!env.GMAIL_USER || !env.GMAIL_APP_PASSWORD) {
        logger.warn("Gmail transport configured but GMAIL_USER or GMAIL_APP_PASSWORD missing — falling back to disabled");
        this.transportType = "disabled";
        return;
      }
      this.transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: env.GMAIL_USER,
          pass: env.GMAIL_APP_PASSWORD,
        },
      });
      logger.info({ user: env.GMAIL_USER }, "Email transport: Gmail");
    } else if (this.transportType === "smtp") {
      if (!env.SMTP_HOST) {
        logger.warn("SMTP transport configured but SMTP_HOST missing — falling back to disabled");
        this.transportType = "disabled";
        return;
      }
      this.transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_PORT === 465,
        auth: env.SMTP_USER
          ? { user: env.SMTP_USER, pass: env.SMTP_PASS ?? "" }
          : undefined,
      });
      logger.info({ host: env.SMTP_HOST, port: env.SMTP_PORT }, "Email transport: SMTP");
    }
  }

  /** Send an email (or log it if disabled) */
  async sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
    const recipients = Array.isArray(options.to) ? options.to.join(", ") : options.to;
    const fromAddress = this.transportType === "gmail"
      ? env.GMAIL_USER!
      : `"${env.SMTP_FROM_NAME}" <${env.SMTP_FROM_EMAIL}>`;

    if (this.transportType === "disabled" || !this.transporter) {
      logger.info(
        { to: recipients, subject: options.subject, transport: "disabled" },
        "Email NOT sent (disabled mode) — preview only",
      );
      return {
        success: true,
        transport: "disabled",
        messageId: `preview-${Date.now()}`,
      };
    }

    try {
      const info = await this.transporter.sendMail({
        from: fromAddress,
        to: recipients,
        subject: options.subject,
        html: options.html,
        text: options.text,
        attachments: options.attachments?.map((a) => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType,
        })),
      });

      logger.info(
        { to: recipients, subject: options.subject, messageId: info.messageId, transport: this.transportType },
        "Email sent successfully",
      );

      return {
        success: true,
        messageId: info.messageId,
        transport: this.transportType,
      };
    } catch (err: any) {
      logger.error(
        { to: recipients, subject: options.subject, error: err.message, transport: this.transportType },
        "Email sending failed",
      );
      return {
        success: false,
        error: err.message,
        transport: this.transportType,
      };
    }
  }

  /** Get current transport status */
  getStatus() {
    return {
      enabled: env.EMAIL_SEND_ENABLED,
      transport: this.transportType,
      configured: this.transporter !== null,
      fromEmail: this.transportType === "gmail" ? env.GMAIL_USER : env.SMTP_FROM_EMAIL,
    };
  }
}

// Singleton
let instance: EmailTransportService | null = null;
export function getEmailTransport(): EmailTransportService {
  if (!instance) instance = new EmailTransportService();
  return instance;
}
