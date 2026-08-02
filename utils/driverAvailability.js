export const getDriverAvailability = ({ isOnline, currentOrders }) => {
  if (!isOnline) return "offline";
  return currentOrders > 0 ? "busy" : "available";
};
