import { de, fi } from "zod/v4/locales";
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
 * @param {Object} options.user - User data for billing information
 * @param {string} options.user.fullname
 * @param {string} options.user.email
 * @param {string} options.user.phone
 * @param {Object} options.user.address
 * @param {string} options.user.address.apartment
 * @param {string} options.user.address.street
 * @param {string} options.user.address.building
 * @param {string} options.user.address.city
 * @param {string} options.user.address.floor
 * @param {string} options.user.address.state
 * @param {string} options.lang - Language for translations
 * @param {string?} options.redirectUrl - URL to redirect after payment
 * @returns {Promise<Object>} - Payment processing result with payment links
 */
export const processPaymobPayment = async ({
  order,
  user,
  lang = "en",
  redirectUrl,
}) => {
  try {
    if (!order || !order.totalAmount || !order.items) {
      throw new Error("Invalid order data");
    }

    // Create payment data for Paymob
    const paymentData = {
      amount: parseFloat(order.totalAmount * 100), // Convert to cents
      currency: "EGP",
      payment_methods: [+process.env.PAYMOB_PAYMENT_METHODS],
      items: order.items.map((item) => ({
        name: item?.product?.name || `Product ID: ${item.productId}`,
        amount: parseFloat(item.price * 100), // Convert to cents
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
      extras: {
        redirection_url: redirectUrl,
      },
      special_reference: order.orderNumber,
      expiration: 3600,
      notification_url: redirectUrl +"2",
      redirection_url: "http://127.0.0.1:3100/api/orders/paymob2",
    };

    console.log("Payment Data:", paymentData);

    // Create payment intention with Paymob API
    const createPaymentLink = await fetch(
      `${process.env.PAYMOB_BASE_URL}/v1/intention`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Token ${process.env.PAYMOB_SECRET_KEY}`,
        },
        body: JSON.stringify(paymentData),
      }
    );

    if (!createPaymentLink.ok) {
      const errorText = await createPaymentLink.text();
      console.error("Error creating payment link:", errorText);
      throw new Error(`Payment link creation failed: ${errorText}`);
    }

    const paymentLinkData = await createPaymentLink.json();

    // Extract payment information
    const payment_key = paymentLinkData?.payment_keys[0]?.key;
    const order_id = paymentLinkData?.payment_keys[0]?.order_id;
    const client_secret = paymentLinkData?.client_secret;
    const unifiedCheckout = `${process.env.PAYMOB_BASE_URL}/unifiedcheckout/?publicKey=${process.env.PAYMOB_PUBLIC_KEY}&clientSecret=${client_secret}`;
    const iframe = `${process.env.PAYMOB_BASE_URL}/api/acceptance/iframes/948177?payment_token=${payment_key}`;
    const iframe2 = `${process.env.PAYMOB_BASE_URL}/api/acceptance/iframes/948178?payment_token=${payment_key}`;

    return {
      success: true,
      paymentId: paymentLinkData.id,
      unifiedCheckout,
      iframe,
      iframe2,
      order_id,
      paymentLinkData,
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

    const { order, type, success } = payload;

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
    console.log("Auth Token Data:", data);

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
    console.log("Get Order Data:", data);

    return data;
  } catch (error) {
    console.error("Error fetching Paymob order:", error);
    throw error;
  }
}