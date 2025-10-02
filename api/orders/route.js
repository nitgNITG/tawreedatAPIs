import express from "express";
import authorization from "../../middleware/authorization.js";
import getTranslation, { langReq } from "../../middleware/getTranslation.js";
import prisma from "../../prisma/client.js";
import FeatureApi from "../../utils/FetchDataApis.js";
import { z } from "zod";
import pushNotification from "../../utils/push-notification.js";
import {
  getPaymobAuthToken,
  getPaymobOrder,
  processPaymobPayment,
} from "../../orders/controllers/paymobController.js";
import crypto from "crypto";

const orderCreateSchema = z.object({
  paymentMethod: z
    .enum(["CREDIT_CARD", "PAYPAL", "BANK_TRANSFER", "CASH_ON_DELIVERY"])
    .default("CASH_ON_DELIVERY"),
  shippingAddress: z.string().optional(),
  notes: z.string().optional(),
  redirectUrl: z.string().optional(), // URL to redirect after payment
});
// Utility to generate a unique order number
async function generateUniqueOrderNumber(userId, prisma) {
  const date = new Date().toISOString().split("T")[0].replace(/-/g, "");
  const shortId = userId.slice(0, 6).toUpperCase();
  let orderNumber;
  let exists = true;
  while (exists) {
    const random = Math.floor(1000 + Math.random() * 9000); // 4-digit random
    orderNumber = `ORD-${date}-${shortId}-${random}`;
    exists = await prisma.order.findUnique({ where: { orderNumber } });
  }
  return orderNumber;
}

const router = express.Router();

router
  .route("/")
  .get(authorization, async (req, res) => {
    const lang = langReq(req);
    const user = req.user;
    try {
      if (user.role !== "ADMIN")
        return res
          .status(403)
          .json({ message: getTranslation(lang, "forbidden") });

      const data = new FeatureApi(req)
        .filter()
        .fields()
        .sort()
        .skip()
        .limit(10)
        .keyword(["customer.fullname", "orderNumber"], "OR").data;

      const orders = await prisma.order.findMany(data);
      const totalCount = await prisma.order.count({ where: data.where });
      const totalPages = Math.ceil(totalCount / +data.take);

      return res.status(200).json({
        orders,
        totalPages,
        totalCount,
        message: getTranslation(lang, "success"),
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  })
  .post(authorization, async (req, res) => {
    const lang = langReq(req);
    const user = req.user;
    const resultValidation = orderCreateSchema.safeParse(req.body);
    if (!resultValidation.success) {
      return res.status(422).json({
        message:
          getTranslation(lang, "validationError") +
          " " +
          resultValidation.error.issues[0].message,
        errors: resultValidation.error.issues.map((issue) => ({
          path: issue.path,
          message: issue.message,
        })),
      });
    }
    try {
      const { redirectUrl, ...data } = resultValidation.data;
      const orderNumber = await generateUniqueOrderNumber(user.id, prisma);
      const query = new FeatureApi(req).fields().data;

      const order = await prisma.$transaction(async (tx) => {
        // Step 1: Get cart items
        const cartItems = await tx.cartItem.findMany({
          where: { userId: user.id },
          select: {
            product: {
              select: {
                id: true,
                price: true,
                stock: true,
              },
            },
            quantity: true,
          },
        });

        if (cartItems.length === 0) {
          throw new Error("Cart is empty");
        }

        // Step 2: Calculate totals
        let subtotal = 0;
        cartItems.forEach((item) => {
          subtotal += item.quantity * item.product.price;
        });

        const shippingCost = 50; // Or custom logic
        const discount = 0;
        const taxAmount = subtotal * 0.1;
        const totalAmount = subtotal;
        // const totalAmount = subtotal + shippingCost + taxAmount - discount;

        // Step 3: Check stock availability
        for (const item of cartItems) {
          if (item.product.stock < item.quantity) {
            throw new Error(`Not enough stock for product ${item.product.id}`);
          }
        }

        // Step 4: Create order
        const newOrder = await tx.order.create({
          data: {
            orderNumber,
            customerId: user.id,
            totalAmount,
            shippingCost,
            discount,
            taxAmount,
            ...data,
            items: {
              create: cartItems.map((item) => ({
                productId: item.product.id,
                quantity: item.quantity,
                price: item.product.price,
              })),
            },
          },
          include: {
            items: {
              select: {
                price: true,
                quantity: true,
                product: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        });
        // Step 5: Decrease product stock
        for (const item of cartItems) {
          await tx.product.update({
            where: { id: item.product.id },
            data: {
              stock: {
                decrement: item.quantity,
              },
            },
          });
        }

        // Step 6: Clear cart
        await tx.cartItem.deleteMany({
          where: { userId: user.id },
        });

        return newOrder;
      });
      if (!order) {
        return res
          .status(400)
          .json({ message: getTranslation(lang, "orderCreationFailed") });
      }
      // Handle payment if payment method is CREDIT_CARD
      if (data.paymentMethod === "CREDIT_CARD") {
        // Process payment with Paymob
        const paymentResult = await processPaymobPayment({
          order,
          user,
          lang,
          redirectUrl,
        });

        if (!paymentResult.success) {
          return res.status(400).json({
            message: getTranslation(lang, "paymentProcessingFailed"),
            error: paymentResult.error,
          });
        }

        // Return order with payment information
        res.status(201).json({
          order,
          payment: {
            ...paymentResult,
          },
          message: getTranslation(lang, "created"),
        });
      } else {
        // Return regular order response for non-credit card payments
        res
          .status(201)
          .json({ order, message: getTranslation(lang, "created") });
      }

      // for the user
      await pushNotification({
        key: {
          title: "notification_order_created_title_user",
          desc: "notification_order_created_desc_user",
        },
        args: {
          title: [],
          desc: [order.totalAmount],
        },
        lang,
        users: [user],
        sendToAdmins: false,
        data: {
          navigate: "orders",
          route: `/${lang}/orders?id=${order.id}`,
        },
      });
      // for admins
      await pushNotification({
        key: {
          title: "notification_order_created_title",
          desc: "notification_order_created_desc",
        },
        args: {
          title: [],
          desc: [user.fullname, order.totalAmount],
        },
        lang,
        users: [],
        data: {
          navigate: "orders",
          route: `/${lang}/orders?id=${order.id}`,
        },
      });
    } catch (error) {
      console.log(error);
      res.status(500).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  });

// Payment status page for redirects from payment gateway
router.get("/paymob", async (req, res) => {
  console.log("hi from paymob");
  console.log("----------------------");
  // Display payment status based on query parameters
  const { success, id, order, hmac, merchant_order_id } = req.query;

  try {
    if (success === "true") {
      // Find the order first to check if it exists
      const existingOrder = await prisma.order.findUnique({
        where: { orderNumber: merchant_order_id },
      });

      if (!existingOrder) {
        console.error(`Order with paymentId ${order} not found`);
        return res.status(404).send(`
          <h1>Error: Order Not Found</h1>
          <p>We couldn't locate the order associated with this payment.</p>
          <p>Please contact customer support with reference number: ${order}</p>
        `);
      }

      // Update order status
      const updatedOrder = await prisma.order.update({
        where: { orderNumber: merchant_order_id },
        data: {
          paymentId: id.toString(),
          paymentStatus: "PAID",
          paymentDetails: JSON.stringify({
            transactionId: id,
            hmac: hmac,
            timestamp: new Date().toISOString(),
            ...req.query,
          }),
        },
      });

      // Return user-friendly success page
      res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Payment Successful</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              max-width: 800px;
              margin: 0 auto;
              padding: 20px;
              text-align: center;
            }
            .success-icon {
              color: #4CAF50;
              font-size: 64px;
              margin-bottom: 20px;
            }
            .btn {
              display: inline-block;
              padding: 10px 20px;
              background-color: #4CAF50;
              color: white;
              text-decoration: none;
              border-radius: 4px;
              margin-top: 20px;
            }
            .order-details {
              background-color: #f5f5f5;
              border-radius: 4px;
              padding: 15px;
              margin-top: 20px;
              text-align: left;
              overflow-x: auto;
            }
          </style>
        </head>
        <body>
          <div class="success-icon">✓</div>
          <h1>Payment Successful!</h1>
          <p>Your payment has been processed successfully and your order is now confirmed.</p>
          <p>Order Number: ${updatedOrder.orderNumber}</p>
          <p>Transaction ID: ${id}</p>
          <div class="order-details">
            <h3>Order Summary</h3>
            <p>Amount: ${updatedOrder.totalAmount}</p>
            <p>Date: ${new Date().toLocaleDateString()}</p>
          </div>
          <pre class="order-details">
          ${JSON.stringify(req.query, null, 2)}
          </pre>
          <p>Please close this window and return to the app.</p>
        </body>
      </html>
      `);
    } else {
      // Handle failed payment
      // Update the order if we can find it
      if (order) {
        try {
          await prisma.order.update({
            where: { paymentId: order.toString() },
            data: {
              paymentStatus: "FAILED",
              paymentDetails: JSON.stringify({
                error: "Payment was not successful",
                timestamp: new Date().toISOString(),
                ...req.query,
              }),
            },
          });
        } catch (err) {
          console.error("Error updating failed payment order:", err);
        }
      }

      // Return user-friendly failure page
      res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Payment Failed</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
              text-align: center;
            }
            .failure-icon {
              color: #f44336;
              font-size: 64px;
              margin-bottom: 20px;
            }
            .btn {
              display: inline-block;
              padding: 10px 20px;
              background-color: #4CAF50;
              color: white;
              text-decoration: none;
              border-radius: 4px;
              margin-top: 20px;
            }
          </style>
        </head>
        <body>
          <div class="failure-icon">✗</div>
          <h1>Payment Failed</h1>
          <p>Unfortunately, your payment could not be processed.</p>
          <p>Reference ID: ${id || "N/A"}</p>
          <p>Please try again or use a different payment method.</p>
          <p>If you continue to experience issues, please contact our customer support.</p>
        </body>
      </html>
      `);
    }
  } catch (error) {
    console.error("Error processing payment callback:", error);
    res.status(500).send(`
      <h1>Payment Processing Error</h1>
      <p>An error occurred while processing your payment: ${error.message}</p>
      <p>Please contact customer support for assistance.</p>
    `);
  }
});
router.get("/paymob2", async (req, res) => {
  console.log("hi from paymob2");
  console.log("---------------------- ln");

  // Display payment status based on query parameters
  const { success, merchant_order_id } = req.query;
  const order = await getPaymobOrder(merchant_order_id);
  if (order.payment_key_claims.extra.redirection_url) {
    res.redirect(
      303,
      `${order.payment_key_claims.extra.redirection_url}?${new URLSearchParams(
        req.query
      ).toString()}`
    );
  }

  try {
    if (success === "true") {
      // Find the order first to check if it exists
      const existingOrder = await prisma.order.findUnique({
        where: { orderNumber: merchant_order_id },
      });

      if (!existingOrder) {
        console.error(`Order with paymentId ${order} not found`);
        return res.status(404).send(`
          <h1>Error: Order Not Found</h1>
          <p>We couldn't locate the order associated with this payment.</p>
          <p>Please contact customer support with reference number: ${order}</p>
        `);
      }

      // Update order status
      const updatedOrder = await prisma.order.update({
        where: { orderNumber: merchant_order_id },
        data: {
          paymentId: id.toString(),
          paymentStatus: "PAID",
          paymentDetails: JSON.stringify({
            transactionId: id,
            hmac: hmac,
            timestamp: new Date().toISOString(),
            ...req.query,
          }),
        },
      });

      // Return user-friendly success page
      res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Payment Successful</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              max-width: 800px;
              margin: 0 auto;
              padding: 20px;
              text-align: center;
            }
            .success-icon {
              color: #4CAF50;
              font-size: 64px;
              margin-bottom: 20px;
            }
            .btn {
              display: inline-block;
              padding: 10px 20px;
              background-color: #4CAF50;
              color: white;
              text-decoration: none;
              border-radius: 4px;
              margin-top: 20px;
            }
            .order-details {
              background-color: #f5f5f5;
              border-radius: 4px;
              padding: 15px;
              margin-top: 20px;
              text-align: left;
              overflow-x: auto;
            }
          </style>
        </head>
        <body>
          <div class="success-icon">✓</div>
          <h1>Payment Successful!</h1>
          <p>Your payment has been processed successfully and your order is now confirmed.</p>
          <p>Order Number: ${updatedOrder.orderNumber}</p>
          <p>Transaction ID: ${id}</p>
          <div class="order-details">
            <h3>Order Summary</h3>
            <p>Amount: ${updatedOrder.totalAmount}</p>
            <p>Date: ${new Date().toLocaleDateString()}</p>
          </div>
          <pre class="order-details">
          ${JSON.stringify(req.query, null, 2)}
          </pre>
          <p>Please close this window and return to the app.</p>
        </body>
      </html>
      `);
    } else {
      // Handle failed payment
      // Update the order if we can find it
      if (order) {
        try {
          await prisma.order.update({
            where: { paymentId: order.toString() },
            data: {
              paymentStatus: "FAILED",
              paymentDetails: JSON.stringify({
                error: "Payment was not successful",
                timestamp: new Date().toISOString(),
                ...req.query,
              }),
            },
          });
        } catch (err) {
          console.error("Error updating failed payment order:", err);
        }
      }

      // Return user-friendly failure page
      res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Payment Failed</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
              text-align: center;
            }
            .failure-icon {
              color: #f44336;
              font-size: 64px;
              margin-bottom: 20px;
            }
            .btn {
              display: inline-block;
              padding: 10px 20px;
              background-color: #4CAF50;
              color: white;
              text-decoration: none;
              border-radius: 4px;
              margin-top: 20px;
            }
          </style>
        </head>
        <body>
          <div class="failure-icon">✗</div>
          <h1>Payment Failed</h1>
          <p>Unfortunately, your payment could not be processed.</p>
          <p>Reference ID: ${id || "N/A"}</p>
          <p>Please try again or use a different payment method.</p>
          <p>If you continue to experience issues, please contact our customer support.</p>
        </body>
      </html>
      `);
    }
  } catch (error) {
    console.error("Error processing payment callback:", error);
    res.status(500).send(`
      <h1>Payment Processing Error</h1>
      <p>An error occurred while processing your payment: ${error.message}</p>
      <p>Please contact customer support for assistance.</p>
    `);
  }
});

// Function to verify the HMAC from Paymob
function verifyPaymobHmac(queryParams) {
  try {
    // Get the HMAC secret from environment variables
    const hmacSecret = process.env.PAYMOB_HMAC_SECRET;

    if (!hmacSecret) {
      console.error("Missing PAYMOB_HMAC_SECRET environment variable");
      return false;
    }

    // Extract the HMAC from the query parameters
    const { hmac } = queryParams;

    if (!hmac) {
      console.error("No HMAC provided in callback");
      return false;
    }
    console.log("Received HMAC:", hmac);

    // Create a sorted string of all parameters except the HMAC itself
    const paramKeys = Object.keys(queryParams)
      .filter((key) => key !== "hmac")
      .sort();
    console.log("Sorted parameter keys:", paramKeys);

    if (paramKeys.length === 0) {
      console.error("No parameters to verify in HMAC");
      return false;
    }

    // Concatenate parameters in the format Paymob uses
    const concatenatedString = paramKeys
      .map((key) => `${key}=${queryParams[key]}`)
      .join("&");

    // Calculate the expected HMAC
    const calculatedHmac = crypto
      .createHmac("sha512", hmacSecret)
      .update(concatenatedString)
      .digest("hex");
    console.log("Calculated HMAC:", calculatedHmac);

    // Compare with the received HMAC (case-insensitive)
    const isValid = calculatedHmac.toLowerCase() === hmac.toLowerCase();

    if (!isValid) {
      console.error("HMAC verification failed:", {
        received: hmac,
        calculated: calculatedHmac,
      });
    }

    return isValid;
  } catch (error) {
    console.error("Error verifying HMAC:", error);
    return false;
  }
}

export default router;
