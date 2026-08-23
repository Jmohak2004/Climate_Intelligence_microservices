export const regions = [
  {
    name: 'Delhi NCR',
    query: 'Delhi NCR, India'
  },
  {
    name: 'Jaipur',
    query: 'Jaipur, Rajasthan, India'
  },
  {
    name: 'Nagpur',
    query: 'Nagpur, Maharashtra, India'
  }
];

export function round(value, digits = 0) {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

export function calculateHeatIndex(temperature, humidity) {
  const t = typeof temperature === 'number' && !isNaN(temperature) ? temperature : 35;
  const r = typeof humidity === 'number' && !isNaN(humidity) ? humidity : 40;

  return round(
    -8.784695 + 1.61139411 * t + 2.338549 * r - 0.14611605 * t * r - 0.012308094 * t * t - 0.016424828 * r * r +
      0.002211732 * t * t * r + 0.00072546 * t * r * r - 0.000003582 * t * t * r * r,
    1
  );
}

export function getRiskLevel(heatIndex) {
  const hi = typeof heatIndex === 'number' && !isNaN(heatIndex) ? heatIndex : 35;
  if (hi >= 50) return 'Severe';
  if (hi >= 46) return 'High';
  if (hi >= 41) return 'Moderate';
  return 'Low';
}

export function buildAdvisories(region) {
  const advisories = [];

  advisories.push(`Stay hydrated and avoid outdoor exposure during peak heat in ${region.name}.`);
  advisories.push(`Open cooling centers and support vulnerable groups in ${region.name}.`);

  if (region.riskLevel === 'Severe' || region.riskLevel === 'High') {
    advisories.push('Trigger heat alert escalation to health workers and local authorities.');
  }

  return advisories;
}

export function buildNotifications(regionsData) {
  return regionsData
    .filter((region) => region.riskLevel === 'Severe' || region.riskLevel === 'High')
    .map((region, index) => ({
      id: `notif-${index + 1}`,
      severity: region.riskLevel === 'Severe' ? 'Critical' : 'High',
      title: `${region.name} heat alert`,
      message: `${region.name} is at ${region.riskLevel.toLowerCase()} heat risk with a heat index of ${region.heatIndex}°C.`,
      region: region.name
    }));
}
