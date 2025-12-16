import getTranslation from "../../middleware/getTranslation.js";
import prisma from "../../prisma/client.js";

/**
 * Process payment with Paymob
 * @param {Object} options - Payment processing options
 * @param {Object} options.order - Order data with total amount and items
 * @param {number} options.order.totalAmount
 * @param {number} options.order.id
 * @param {string} options.order.orderNumber
 * @param {Array<{
 *   productId: number,
 *   quantity: number,
 *   price: number,
 *   product: { name: string }
 * }>} options.order.items
 * @param {import("@prisma/client").User } options.user
 * @param {string} options.lang - Language for translations
 * @param {string?} options.redirectUrl - URL to redirect after payment
 * @param {{
 * paymentMethods: string;
 * baseUrl: string;
 * secretKey: string;
 * publicKey: string;
 * iframes: string;
 * }} options.paymob - paymob env variables
 * @returns {Promise<{
 * success: true;
 * paymentLink: string;
 * message: string;
 * } | {
 * success: false;
 * message: string;
 * error: string;
 * }>} - Payment processing result with payment links
 */
export const processPaymobPayment = async ({
  order,
  user,
  lang = "en",
  redirectUrl,
  paymob,
}) => {
  try {
    if (!order || !order.totalAmount || !order.items) {
      throw new Error("Invalid order data");
    }

    const paymentMethods = parseNumberArray(paymob.paymentMethods);

    const iframeIds = parseStringArray(paymob.iframes);

    if (!paymentMethods.length) {
      throw new Error("No Paymob payment methods configured");
    }

    // Create payment data for Paymob
    const paymentData = {
      amount: Number.parseFloat(order.totalAmount * 100), // Convert to cents
      currency: "EGP",
      payment_methods: paymentMethods,
      items: order.items.map((item) => ({
        name: item?.product?.name || `Product ID: ${item.productId}`,
        amount: Number.parseFloat(item.price * 100), // Convert to cents
        quantity: item.quantity,
      })),
      billing_data: {
        apartment: user?.address?.apartment || "N/A",
        first_name: user?.fullname?.split(" ")[0] || "Customer",
        last_name: user?.fullname?.split(" ")[1] || "",
        street: user?.address?.street || "N/A",
        building: user?.address?.building || "N/A",
        phone_number: user?.phone || "+201000000000",
        city: user?.address?.city || "N/A",
        country: "EG",
        email: user?.email || "customer@example.com",
        floor: user?.address?.floor || "N/A",
        state: user?.address?.state || "N/A",
      },
      customer: {
        first_name: user?.fullname?.split(" ")[0] || "Customer",
        last_name: user?.fullname?.split(" ")[1] || "",
        email: user?.email || "customer@example.com",
        extras: {
          phone_number: user?.phone || "+201125773493",
        },
      },
      special_reference: order.orderNumber,
      expiration: 3600,
      // notification_url: `${process.env.BASE_URL}/api/payments/callback`,
      // redirection_url:
      //   redirectUrl || `${process.env.BASE_URL}/api/payments/callback`,
      notification_url: `https://unwaddling-jericho-checkable.ngrok-free.dev/api/payments/callback`,
      redirection_url:
        redirectUrl ||
        `https://unwaddling-jericho-checkable.ngrok-free.dev/api/payments/callback`,
    };

    // Create payment intention with Paymob API
    const createPaymentLink = await fetch(`${paymob.baseUrl}/v1/intention`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Token ${paymob.secretKey}`,
      },
      body: JSON.stringify(paymentData),
    });

    if (!createPaymentLink.ok) {
      const errorText = await createPaymentLink.text();
      console.error("Error creating payment link:", errorText);
      throw new Error(`Payment link creation failed: ${errorText}`);
    }

    const paymentLinkData = await createPaymentLink.json();

    // Extract payment information
    const payment_key = paymentLinkData?.payment_keys[0]?.key;
    const client_secret = paymentLinkData?.client_secret;
    const unifiedCheckout = `${paymob.baseUrl}/unifiedcheckout/?publicKey=${paymob.publicKey}&clientSecret=${client_secret}`;
    // 950122, 950121

    const iframes = iframeIds.map((iframeId) => ({
      iframeId,
      url: `${paymob.baseUrl}/api/acceptance/iframes/${iframeId}?payment_token=${payment_key}`,
    }));
    return {
      success: true,
      paymentLink: unifiedCheckout,
      iframes,
      message: getTranslation(lang, "paymentLinkCreated"),
    };
  } catch (error) {
    console.error("Paymob payment processing error:", error);
    return {
      success: false,
      message: getTranslation(lang, "paymentProcessingFailed"),
      error: error.message,
    };
  }
};

const parseNumberArray = (value) => {
  if (!value) return [];
  return value
    .split(",")
    .map((v) => Number(v.trim()))
    .filter((v) => !Number.isNaN(v));
};

const parseStringArray = (value) => {
  if (!value) return [];
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
};

/**
 * Verify Paymob payment webhook
 * @param {Object} req - Request object from webhook
 * @returns {Promise<Object>} - Payment verification result
 */
export const verifyPaymobPayment = async (req) => {
  try {
    const { payload } = req.body;

    if (!payload || !payload.order) {
      throw new Error("Invalid webhook payload");
    }

    const { order, success } = payload;

    // Get the order ID from the extras
    const orderId = order.extras?.order_id;

    if (!orderId) {
      throw new Error("Order ID not found in payment data");
    }

    // Find the corresponding order in our system
    const existingOrder = await prisma.order.findFirst({
      where: {
        paymentId: order.id.toString(),
      },
    });

    if (!existingOrder) {
      throw new Error(`Order not found with payment ID: ${order.id}`);
    }

    // Update order based on payment status
    if (success) {
      await prisma.order.update({
        where: { id: existingOrder.id },
        data: {
          paymentStatus: "PAID",
          paymentDetails: JSON.stringify(payload),
        },
      });

      return { success: true, message: "Payment verified successfully" };
    } else {
      await prisma.order.update({
        where: { id: existingOrder.id },
        data: {
          paymentStatus: "FAILED",
          paymentDetails: JSON.stringify(payload),
        },
      });

      return { success: false, message: "Payment failed" };
    }
  } catch (error) {
    console.error("Payment verification error:", error);
    return {
      success: false,
      message: "Payment verification failed",
      error: error.message,
    };
  }
};

export async function getPaymobAuthToken() {
  try {
    const response = await fetch(
      `${process.env.PAYMOB_BASE_URL}/api/auth/tokens`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: process.env.PAYMOB_API_KEY,
          // api_key: process.env.PAYMOB_API_SECRET,
        }),
      }
    );
    if (!response.ok) {
      const errorText = await response.text();
      console.log(errorText);
      throw new Error(`Failed to get auth token: ${errorText}`);
    }
    const data = await response.json();

    return data.token;
  } catch (error) {
    console.error("Error fetching Paymob auth token:", error);
    throw error;
  }
}

async function createPaymobPayment(token, amount) {
  try {
    const response = await fetch(
      `${process.env.PAYMOB_BASE_URL}/api/ecommerce/orders`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          auth_token: token,
          delivery_needed: "false",
          amount_cents: amount * 100, // Convert to cents
          currency: "EGP",
          items: [],
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create Paymob payment: ${errorText}`);
    }

    const data = await response.json();
    console.log("Create Payment Data:", data);

    return data.id;
  } catch (error) {
    console.error("Error creating Paymob payment:", error);
    throw error;
  }
}

async function createPaymobPaymentKey(token, orderId, amount) {
  try {
    const response = await fetch(
      `${process.env.PAYMOB_BASE_URL}/api/acceptance/payment_keys`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          auth_token: token,
          amount_cents: amount * 100, // Convert to cents
          expiration: 3600,
          order_id: orderId,
          billing_data: {
            first_name: "First",
            last_name: "Last",
            email: "email@example.com",
            phone_number: "+201000000000",
            apartment: "N/A",
            floor: "N/A",
            street: "N/A",
            building: "N/A",
            city: "N/A",
            country: "EG",
            state: "N/A",
            zip: "N/A",
          },
          currency: "EGP",
          integration_id: +process.env.PAYMOB_PAYMENT_METHODS,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create Paymob payment key: ${errorText}`);
    }

    const data = await response.json();
    console.log("Create Payment Key Data:", data);
    return data.token;
  } catch (error) {
    console.error("Error creating Paymob payment key:", error);
    throw error;
  }
}

export async function payment(amount) {
  try {
    const authToken = await getPaymobAuthToken();
    const orderId = await createPaymobPayment(authToken, amount);
    const paymentKey = await createPaymobPaymentKey(authToken, orderId, amount);
    const paymentUrl = `${process.env.PAYMOB_BASE_URL}/api/acceptance/iframes/948177?payment_token=${paymentKey}`;
    return { paymentUrl, orderId, paymentKey };
  } catch (error) {
    console.error("Error in payment function:", error);
    throw error;
  }
}

export async function getPaymobOrder(merchant_order_id) {
  try {
    const authToken = await getPaymobAuthToken();
    const response = await fetch(
      `${process.env.PAYMOB_BASE_URL}/api/ecommerce/orders/transaction_inquiry`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authToken,
        },
        body: JSON.stringify({ merchant_order_id }),
      }
    );
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get Paymob order: ${errorText}`);
    }
    const data = await response.json();
    console.log("Get Order Data:", data.id);

    return data;
  } catch (error) {
    console.error("Error fetching Paymob order:", error);
    throw error;
  }
}
