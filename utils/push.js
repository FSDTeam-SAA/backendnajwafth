import { getMessaging, isPushEnabled } from "./firebaseAdmin.js";
import { User } from "../model/user.model.js";

/**
 * Sends an FCM push to all registered devices of a single user, but only when
 * that user has push enabled. Invalid/expired tokens are pruned automatically.
 *
 * This is best-effort: any failure is logged and swallowed so it never blocks
 * the in-app notification flow.
 */
export const sendPushToUser = async (userId, { title, body, data = {} }) => {
  if (!isPushEnabled() || !userId) return;

  try {
    const user = await User.findById(userId).select(
      "enableNotifications fcmTokens",
    );
    if (!user || user.enableNotifications === false) return;

    const tokens = (user.fcmTokens || []).filter(Boolean);
    if (!tokens.length) return;

    // FCM data payload values must be strings.
    const stringData = Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, v == null ? "" : String(v)]),
    );

    const response = await getMessaging().sendEachForMulticast({
      tokens,
      notification: { title, body },
      data: stringData,
      android: { priority: "high" },
      apns: {
        payload: { aps: { sound: "default" } },
      },
    });

    // Remove tokens that are no longer valid.
    const staleTokens = [];
    response.responses.forEach((res, idx) => {
      if (!res.success) {
        const code = res.error?.code || "";
        if (
          code === "messaging/registration-token-not-registered" ||
          code === "messaging/invalid-registration-token" ||
          code === "messaging/invalid-argument"
        ) {
          staleTokens.push(tokens[idx]);
        }
      }
    });

    if (staleTokens.length) {
      await User.updateOne(
        { _id: userId },
        { $pull: { fcmTokens: { $in: staleTokens } } },
      );
    }
  } catch (err) {
    console.warn(`[push] Failed to send to user ${userId}:`, err.message);
  }
};
