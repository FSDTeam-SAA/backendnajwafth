import { Order } from "../model/order.model.js";
import { paymentInfo } from "../model/payment.model.js";
import Stripe from "stripe";
import { createNotification } from "../utils/notification.js";

// Lazily construct the Stripe client so the server can boot (and every
// non-payment route keeps working) even when STRIPE_SECRET_KEY is not set.
let stripeClient = null;
const getStripe = () => {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  if (!stripeClient) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2022-11-15",
    });
  }
  return stripeClient;
};

// Admin commission rate - 4.99%
const ADMIN_COMMISSION_RATE = 0.0499;

export const createPayment = async (req, res) => {
  const { price, orderId, type } = req.body;
  // Prefer the authenticated user; fall back to an explicit body field for
  // legacy callers.
  const userId = req.user?._id?.toString() || req.body.userId;

  const stripe = getStripe();
  if (!stripe) {
    return res.status(503).json({
      error: "Payments are not configured. Set STRIPE_SECRET_KEY on the server.",
    });
  }

  if (!price || !type) {
    return res.status(400).json({ error: "Price and type are required." });
  }

  if (type !== "order") {
    return res
      .status(400)
      .json({ error: "Only order payments are supported." });
  }

  if (!orderId) {
    return res
      .status(400)
      .json({ error: "Order ID is required for order payments." });
  }

  try {
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ error: "Order not found." });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(price * 100),
      currency: "usd",
      automatic_payment_methods: { enabled: true },
      metadata: { userId, type, orderId },
    });

    await paymentInfo.create({
      userId,
      orderId,
      price,
      transactionId: paymentIntent.id,
      paymentStatus: "pending",
      type,
    });

    res.status(200).json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      message: "PaymentIntent created.",
    });
  } catch (error) {
    res.status(500).json({ error: "Internal server error." });
    console.log(error);
  }
};

export const confirmPayment = async (req, res) => {
  const { paymentIntentId } = req.body;

  const stripe = getStripe();
  if (!stripe) {
    return res.status(503).json({
      error: "Payments are not configured. Set STRIPE_SECRET_KEY on the server.",
    });
  }

  if (!paymentIntentId) {
    return res.status(400).json({ error: "Missing paymentIntentId" });
  }

  try {
    // Retrieve payment intent from Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (!paymentIntent) {
      return res.status(404).json({ error: "PaymentIntent not found" });
    }

    // Check final status
    if (paymentIntent.status !== "succeeded") {
      await paymentInfo.findOneAndUpdate(
        { transactionId: paymentIntentId },
        { paymentStatus: "failed" },
      );

      return res.status(400).json({
        error: "Payment did not succeed",
        status: paymentIntent.status,
      });
    }

    // Update database
    const paymentRecord = await paymentInfo.findOne({
      transactionId: paymentIntentId,
    });

    if (!paymentRecord) {
      return res.status(404).json({ error: "Payment record not found" });
    }

    const wasAlreadyComplete = paymentRecord.paymentStatus === "complete";

    // Calculate admin commission for order payments
    let adminCommission = 0;
    if (paymentRecord.type === "order") {
      adminCommission = paymentRecord.price * ADMIN_COMMISSION_RATE;
    }

    // Update payment record
    await paymentInfo.findOneAndUpdate(
      { transactionId: paymentIntentId },
      {
        paymentStatus: "complete",
        adminCommission,
      },
      { new: true },
    );

    // Handle order payment
    let order = null;
    if (paymentRecord.orderId) {
      order = await Order.findById(paymentRecord.orderId).populate(
        "items.product customer vendor",
      );

      if (order) {
        await Order.findByIdAndUpdate(paymentRecord.orderId, {
          paymentStatus: "paid",
        });
      }
    }

    if (!wasAlreadyComplete && order) {
      await Promise.all([
        createNotification({
          user: order.customer?._id || paymentRecord.userId,
          actor: paymentRecord.userId,
          order: order._id,
          payment: paymentRecord._id,
          type: "payment_success",
          title: "Payment successful",
          message: `Your payment for order ${order.orderId} was confirmed successfully.`,
          metadata: {
            orderId: order.orderId,
            amount: paymentRecord.price,
          },
        }),
        createNotification({
          user: order.vendor?._id,
          actor: paymentRecord.userId,
          order: order._id,
          payment: paymentRecord._id,
          type: "order_paid",
          title: "Order payment received",
          message: `Payment for order ${order.orderId} has been confirmed.`,
          metadata: {
            orderId: order.orderId,
            amount: paymentRecord.price,
          },
        }),
      ]);
    }

    return res.status(200).json({
      success: true,
      message: "Payment confirmed",
      paymentIntentId,
      type: paymentRecord.type,
      adminCommission: adminCommission.toFixed(2),
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      error: "Internal server error",
      stripeError: error?.message,
    });
  }
};
