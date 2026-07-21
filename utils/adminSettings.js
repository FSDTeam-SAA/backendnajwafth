import { AdminSettings } from "../model/adminSettings.model.js";

export const getAdminSettings = async () => {
  const settings = await AdminSettings.findOneAndUpdate(
    { key: "global" },
    { $setOnInsert: { key: "global", adminCommissionRate: 15 } },
    { new: true, upsert: true },
  ).lean();

  return settings;
};

export const getAdminCommissionRate = async () => {
  const settings = await getAdminSettings();
  return Number(settings.adminCommissionRate ?? 15);
};
