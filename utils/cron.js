/*import cron from "node-cron";
import Spot from "../model/spot.model.js";

// helper to convert "07:00 PM" to Date
const convertToDateTime = (baseDate, timeStr) => {
  const date = new Date(baseDate);
  const [time, modifier] = timeStr.split(" ");
  let [hours, minutes] = time.split(":").map(Number);

  if (modifier === "PM" && hours !== 12) hours += 12;
  if (modifier === "AM" && hours === 12) hours = 0;

  date.setHours(hours, minutes, 0, 0);
  return date;
};

 Run every 10 minutes (better than every hour)
cron.schedule("10 * * * *", async () => {
  try {
    const now = new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const spots = await Spot.find({ isActive: true });

    for (const spot of spots) {
      let newStatus = "";

      for (const availability of spot.availability) {
        const spotDate = new Date(availability.date);
        spotDate.setHours(0, 0, 0, 0);

        if (spotDate.getTime() !== today.getTime()) continue;

        for (const slot of availability.slots) {
          const startTime = convertToDateTime(spotDate, slot.start);
          const endTime = convertToDateTime(spotDate, slot.end);

          if (now > endTime) {
            newStatus = "ended";
          } else if (now >= startTime && now <= endTime) {
            newStatus = "running";
            break;
          }
        }
      }

      if (spot.status !== newStatus) {
        spot.status = newStatus;
        await spot.save();
      }
    }

    console.log("Spot status updated successfully");
  } catch (error) {
    console.error("Error updating spot status:", error);
  }
});*/