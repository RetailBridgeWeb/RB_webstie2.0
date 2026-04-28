import nodemailer from "nodemailer";
import { config } from "./config.js";
import { supabaseAdmin } from "./supabase.js";

const emailEnabled =
  Boolean(config.smtpHost) &&
  Boolean(config.smtpUser) &&
  Boolean(config.smtpPass) &&
  Boolean(config.smtpFrom);

const transporter = emailEnabled
  ? nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      auth: {
        user: config.smtpUser,
        pass: config.smtpPass,
      },
    })
  : null;

export async function getUserEmail(userId) {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);

  if (error || !data.user?.email) {
    return null;
  }

  return data.user.email;
}

export async function sendEmail({ to, subject, text, html }) {
  if (!emailEnabled || !transporter || !to) {
    return { skipped: true };
  }

  await transporter.sendMail({
    from: config.smtpFrom,
    to,
    subject,
    text,
    html,
  });

  return { skipped: false };
}
