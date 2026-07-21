import { AdminSettings } from "../model/adminSettings.model.js";

export const getAdminSettings = async () => {
  const settings = await AdminSettings.findOneAndUpdate(
    { key: "global" },
    { $setOnInsert: { key: "global", adminCommissionRate: 15, deliveryFee: 5 } },
    { new: true, upsert: true },
  ).lean();

  return settings;
};

export const getAdminCommissionRate = async () => {
  const settings = await getAdminSettings();
  return Number(settings.adminCommissionRate ?? 15);
};

export const getDeliveryFee = async () => {
  const settings = await getAdminSettings();
  return Number(settings.deliveryFee ?? 5);
};
