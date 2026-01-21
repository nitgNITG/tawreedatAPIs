import { createTransport } from "nodemailer";

export function getTransporter() {
  return createTransport({
    host: process.env.MAIL_HOST,
    port: Number(process.env.MAIL_PORT),
    secure: Number(process.env.MAIL_PORT) === 465,
    requireTLS: Number(process.env.MAIL_PORT) === 465,
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS,
    },
  });
}

export async function verifyMailer() {
  const transporter = getTransporter();
  await transporter.verify();
  console.log("✅ Mail transporter is ready");
}
