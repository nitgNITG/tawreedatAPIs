import { AppError } from "../../utils/appError.js";
import { getApplicationSettings } from "../../utils/getApplicationSettings.js";

const processPaymobRefund = async ({ transactionId, amount }) => {
  if (!transactionId) throw new AppError("missingTransactionId", 422);

  if (!amount || amount <= 0) throw new AppError("invalidRefundAmount", 422);

  const settings = await getApplicationSettings();

  if (!settings?.paymob_secret_key || !settings?.paymob_base_url)
    throw new AppError("paymentProviderMisconfigured", 422);

  const payload = {
    transaction_id: String(transactionId),
    amount_cents: Math.round(amount * 100),
  };
  console.log(payload);

  try {
    const response = await fetch(
      `${settings.paymob_base_url}/api/acceptance/void_refund/refund`,
      {
        method: "POST",
        headers: {
          Authorization: `Token ${settings.paymob_secret_key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.log("paymobHttpError", data);
      throw new AppError("paymobHttpError", { raw: data });
    }

    const isSuccess =
      data?.success === true &&
      data?.is_refund === true &&
      data?.data?.migs_result === "SUCCESS";

    if (!isSuccess) {
      console.log("paymobRefundRejected", data);
      throw new AppError("paymobRefundRejected", { raw: data });
    }

    return {
      providerRefundId: String(data.id),
      rawResponse: data,
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    console.log("paymobUnexpectedError", err);
    throw new AppError("paymobUnexpectedError", {
      message: err.message,
    });
  }
};

export default processPaymobRefund;
