// scripts/test-mailer.js
import "dotenv/config"; // IMPORTANT: loads .env before anything else
import nodemailer from "nodemailer";

// Optional: allow overriding via CLI args
// Usage: node scripts/test-mailer.js --to someone@example.com
const args = process.argv.slice(2);
const toArgIndex = args.indexOf("--to");
const TO = toArgIndex !== -1 ? args[toArgIndex + 1] : null;

function envSummary() {
  const user = process.env.MAIL_USER ?? "";
  const pass = process.env.MAIL_PASS ?? "";
  return {
    NODE_ENV: process.env.NODE_ENV,
    MAIL_HOST: process.env.MAIL_HOST,
    MAIL_PORT: process.env.MAIL_PORT,
    MAIL_SECURE: process.env.MAIL_SECURE,
    MAIL_USER_present: Boolean(user && user.trim()),
    MAIL_PASS_present: Boolean(pass && pass.trim()),
    MAIL_USER_len: user.length,
    MAIL_PASS_len: pass.length,
    // Helps catch whitespace/quotes issues:
    MAIL_USER_repr: JSON.stringify(user),
  };
}

function buildTransporter() {
  // Recommended: choose ONE mode:
  // 1) Gmail mode if MAIL_PROVIDER=gmail
  // 2) SMTP host mode otherwise

  const provider = (process.env.MAIL_PROVIDER || "").toLowerCase();

  if (provider === "gmail") {
    return nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS, // should be Gmail App Password usually
      },
    });
  }

  // Default: host/port from env (Ethereal/custom SMTP)
  return nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: Number(process.env.MAIL_PORT),
    secure: Number(process.env.MAIL_PORT) === 465,
    requireTLS: Number(process.env.MAIL_PORT) === 465,
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS,
    },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}

async function main() {
  console.log("=== ENV SUMMARY ===");
  console.log(envSummary());

  const transporter = buildTransporter();

  console.log("\n=== VERIFY START ===");
  try {
    await transporter.verify();
    console.log("✅ VERIFY OK: transporter is ready");
  } catch (err) {
    console.error("❌ VERIFY FAILED");
    console.error("Name:", err?.name);
    console.error("Code:", err?.code);
    console.error("Command:", err?.command);
    console.error("Message:", err?.message);
    // Print full error last (helps see response codes)
    console.error(err);
    process.exitCode = 1;
    return;
  }

  if (!TO) {
    console.log("\n(No --to provided, skipping send test)");
    return;
  }

  console.log("\n=== SEND TEST START ===");
  try {
    const info = await transporter.sendMail({
      from: process.env.MAIL_FROM || process.env.MAIL_USER,
      to: TO,
      subject: "Mailer test ✅",
      text: "If you received this, Nodemailer is working.",
      html: "<p>If you received this, <b>Nodemailer is working</b>.</p>",
    });

    console.log("✅ SEND OK");
    console.log({
      messageId: info?.messageId,
      accepted: info?.accepted,
      rejected: info?.rejected,
      response: info?.response,
    });
  } catch (err) {
    console.error("❌ SEND FAILED");
    console.error("Name:", err?.name);
    console.error("Code:", err?.code);
    console.error("Command:", err?.command);
    console.error("Message:", err?.message);
    console.error(err);
    process.exitCode = 1;
  }
}

await main();
