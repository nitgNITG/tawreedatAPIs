const token = process.env.TAQNYAT_TOKEN_KEY;
export const sendSMSMessage = async ({ recipients, message }) => {
  try {
    const url = "https://api.taqnyat.sa/v1/messages";
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        recipients,
        body: message,
        sender: "invstTec",
      }),
    });

    if (!res.ok) {
      return { error: await res.text(), data: null };
    }
    const response = await res.json();
    return { data: response, error: null };
  } catch (error) {
    console.error("Error Sending Message:", error);
    return { error, data: null };
  }
};

export const sendOTPMail = async (campaignName, subject, from, to, msg) => {
  const url = "https://api.taqnyat.sa/mailSend.php";

  const params = new URLSearchParams({
    bearerTokens: token,
    campaignName: campaignName,
    subject: subject,
    from: from,
    to: to.join(","), // Join the array of email addresses into a comma-separated string
    msg: msg,
  });

  try {
    const response = await fetch(`${url}?${params.toString()}`, {
      method: "GET",
    });

    if (!response.ok) {
      throw new Error(`Error: ${response.status} - ${response.statusText}`);
    }

    const result = await response.json();
    console.log("Mail Sent:", result);
    return result;
  } catch (error) {
    console.error("Error Sending Mail:", error);
    throw error;
  }
};
