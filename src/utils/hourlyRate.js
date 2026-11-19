// Rentals are billed PER HOUR. The rate per hour is the car's "22 Hours" price spread over those 22 hours (or, for a car
// that only has a "12 Hours" price, that price spread over 12). The server uses the same rule (utils/pricing.js), so
// what a car card shows is what the booking is charged.
export const hourlyRateOf = (pricing = []) => {
  const p22 = (pricing || []).find((p) => p.durationType === "22 Hours");
  if (p22 && Number(p22.price) > 0) return Number(p22.price) / 22;
  const p12 = (pricing || []).find((p) => p.durationType === "12 Hours");
  return p12 && Number(p12.price) > 0 ? Number(p12.price) / 12 : 0;
};

// A car object from the API: use its ready-made pricePerHour, else work it out from its pricing list.
export const carHourlyRate = (car) =>
  Number(car?.pricePerHour) > 0 ? Number(car.pricePerHour) : hourlyRateOf(car?.pricing);

export const MIN_HOURS = 12;
