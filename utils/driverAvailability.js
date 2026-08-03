export const activeDriverRequestStatuses = Object.freeze(["accepted"]);

export const isDriverRequestActive = (status) => {
  return activeDriverRequestStatuses.includes(status);
};

export const getDriverRideStatus = ({ currentOrders }) => {
  return currentOrders > 0 ? "busy" : "available";
};

export const getDriverOnlineStatus = ({ isOnline }) => {
  return isOnline ? "online" : "offline";
};

export const getDriverAvailability = ({ isOnline, currentOrders }) => {
  if (!isOnline) return "offline";
  return getDriverRideStatus({ currentOrders });
};
