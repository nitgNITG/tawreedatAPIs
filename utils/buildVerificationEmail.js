const buildVerificationEmail = ({ name, code, lang }) => {
  const subject =
    lang === "AR" ? "رمز تفعيل الحساب" : "Account verification code";

  const text =
    lang === "AR"
      ? `مرحباً ${name}\nرمز التفعيل الخاص بك هو: ${code}`
      : `Hi ${name}\nYour verification code is: ${code}`;

  const html =
    lang === "AR"
      ? `<p>مرحباً ${name}</p><p>رمز التفعيل الخاص بك هو:</p><h2>${code}</h2>`
      : `<p>Hi ${name}</p><p>Your verification code is:</p><h2>${code}</h2>`;

  return { subject, text, html };
};

export default buildVerificationEmail;
