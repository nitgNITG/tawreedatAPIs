import { transporter } from "./mailer.js";

export default async function sendEmail({ to, subject, text, html }) {
  const info = await transporter.sendMail({
    from: process.env.MAIL_FROM || process.env.MAIL_USER,
    to,
    subject,
    text,
    html,
  });

  return info; // includes messageId etc.
}
