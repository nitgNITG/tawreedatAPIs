import nodemailer from "nodemailer";

export const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: Number(process.env.MAIL_PORT),
  secure: process.env.MAIL_SECURE === "true", // true for 465, false for 587
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

// Optional: verify on startup (helps catch config issues early)
export async function verifyMailer() {
  try {
    await transporter.verify();
    console.log("✅ Mail transporter is ready");
  } catch (err) {
    console.error("❌ Mail transporter verify failed:", err);
  }
}
