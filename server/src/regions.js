import { buildAdvisories, buildNotifications, calculateHeatIndex, getRiskLevel, round } from './heatwave.js';
import { fetchJson } from './climate.js';

const KNOWN_COORDINATES = {
  'Delhi NCR, India': { latitude: 28.6139, longitude: 77.209 },
  'Jaipur, Rajasthan, India': { latitude: 26.9124, longitude: 75.7873 },
  'Nagpur, Maharashtra, India': { latitude: 21.1458, longitude: 79.0882 }
};

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);

// Resolves a place name to coordinates via Nominatim. Returns null when nothing
// matches; network failures throw so the caller can tell "unknown place" from "API down".
export async function getCoordinates(query) {
  if (KNOWN_COORDINATES[query]) {
    return KNOWN_COORDINATES[query];
  }

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');

  const data = await fetchJson(url.toString(), {
    headers: { 'User-Agent': 'SuryaRakshak-Heatwave-Monitor/1.0 (https://github.com/Jmohak2004/LY)' }
  });
  const first = data[0];
  return first ? { latitude: Number(first.lat), longitude: Number(first.lon) } : null;
}

// Returns null (never invented numbers) when Open-Meteo can't be reached.
async function getWeatherSnapshot(latitude, longitude) {
  try {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', String(latitude));
    url.searchParams.set('longitude', String(longitude));
    url.searchParams.set('current', 'temperature_2m,relative_humidity_2m,apparent_temperature');
    url.searchParams.set('daily', 'uv_index_max');
    url.searchParams.set('timezone', 'auto');
    return await fetchJson(url.toString());
  } catch (error) {
    console.warn(`Open-Meteo fetch failed for (${latitude}, ${longitude}):`, error.message);
    return null;
  }
}

// NASA POWER lags real time by several days and returns -999 for days it has no data
// for, so request a recent window and use the latest valid day.
async function getNasaPowerSnapshot(latitude, longitude) {
  try {
    const stamp = (daysAgo) => new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10).replace(/-/g, '');
    const url = new URL('https://power.larc.nasa.gov/api/temporal/daily/point');
    url.searchParams.set('parameters', 'T2M_MAX');
    url.searchParams.set('community', 'RE');
    url.searchParams.set('longitude', String(longitude));
    url.searchParams.set('latitude', String(latitude));
    url.searchParams.set('start', stamp(10));
    url.searchParams.set('end', stamp(0));
    url.searchParams.set('format', 'JSON');

    const data = await fetchJson(url.toString());
    const t2mMax = data?.properties?.parameter?.T2M_MAX || {};
    const day = Object.keys(t2mMax).sort().reverse().find((key) => t2mMax[key] > -900);
    if (!day) return null;
    return { date: `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}`, t2mMax: round(t2mMax[day], 1) };
  } catch (error) {
    console.warn('NASA POWER API request failed:', error.message);
    return null;
  }
}

// Builds the public region record. When Open-Meteo is unreachable the last stored
// readings are returned, flagged `live: false` — readings are never made up.
export function summarizeRegion(region, openMeteo, nasaPower) {
  const current = openMeteo?.current;
  if (!isNumber(current?.temperature_2m) || !isNumber(current?.relative_humidity_2m)) {
    const hasStored = isNumber(region.heatIndex);
    return {
      ...region,
      live: false,
      summary: hasStored
        ? `${region.name}: live data unavailable, showing last known readings.`
        : `${region.name}: live data unavailable.`,
      advisories: region.riskLevel ? buildAdvisories({ name: region.name, riskLevel: region.riskLevel }) : []
    };
  }

  const heatIndex = calculateHeatIndex(current.temperature_2m, current.relative_humidity_2m);
  const riskLevel = getRiskLevel(heatIndex);
  return {
    name: region.name,
    query: region.query,
    latitude: round(region.latitude, 4),
    longitude: round(region.longitude, 4),
    temperature: round(current.temperature_2m, 1),
    humidity: round(current.relative_humidity_2m, 0),
    apparentTemperature: isNumber(current.apparent_temperature) ? round(current.apparent_temperature, 1) : null,
    uvIndexMax: isNumber(openMeteo.daily?.uv_index_max?.[0]) ? round(openMeteo.daily.uv_index_max[0], 1) : null,
    heatIndex,
    riskLevel,
    observedAt: current.time,
    timezone: openMeteo.timezone_abbreviation ?? openMeteo.timezone ?? null,
    nasaPower,
    live: true,
    summary: `${region.name} is currently at ${riskLevel.toLowerCase()} heat risk.`,
    advisories: buildAdvisories({ name: region.name, riskLevel })
  };
}

const fetchSnapshots = (region) =>
  Promise.all([getWeatherSnapshot(region.latitude, region.longitude), getNasaPowerSnapshot(region.latitude, region.longitude)]);

// store: { getRegions, addRegion, updateRegionWeather, getAlerts }
export function registerRegionRoutes(app, store) {
  app.get('/api/dashboard', async (_req, res) => {
    try {
      const stored = await store.getRegions();
      const regions = await Promise.all(
        stored.map(async (region) => {
          const [openMeteo, nasaPower] = await fetchSnapshots(region);
          const summary = summarizeRegion(region, openMeteo, nasaPower);
          if (summary.live) {
            try {
              await store.updateRegionWeather(region.name, summary);
            } catch (error) {
              console.warn(`Could not store latest readings for ${region.name}:`, error.message);
            }
          }
          return summary;
        })
      );

      const alerts = await store.getAlerts();
      const rated = regions.filter((region) => region.riskLevel);
      const highRisk = rated.filter((region) => region.riskLevel === 'Severe' || region.riskLevel === 'High').length;
      const sources = [];
      if (regions.some((region) => region.live)) sources.push('Open-Meteo');
      if (regions.some((region) => region.nasaPower)) sources.push('NASA POWER');

      res.json({
        summary: {
          activeAlerts: highRisk + alerts.length,
          highRiskDistricts: highRisk,
          averageHeatIndex: rated.length ? round(rated.reduce((total, region) => total + region.heatIndex, 0) / rated.length, 1) : null,
          regionsLive: regions.filter((region) => region.live).length,
          regionsMonitored: regions.length
        },
        regions,
        notifications: buildNotifications(rated),
        alerts,
        generatedAt: new Date().toISOString(),
        sources
      });
    } catch (error) {
      console.error('Dashboard failed:', error.message);
      res.status(503).json({ error: 'Dashboard data is unavailable', message: error.message });
    }
  });

  app.get('/api/regions', async (_req, res) => {
    try {
      res.json(await store.getRegions());
    } catch (error) {
      res.status(500).json({ error: 'Failed to load regions', message: error.message });
    }
  });

  app.post('/api/regions', async (req, res) => {
    const { query, name } = req.body ?? {};
    if (!query || !name) {
      return res.status(400).json({ error: 'Missing query or name' });
    }

    try {
      const existing = await store.getRegions();
      if (existing.some((region) => region.name.toLowerCase() === String(name).toLowerCase())) {
        return res.status(400).json({ error: 'Region already monitored.' });
      }

      let coordinates;
      try {
        coordinates = await getCoordinates(query);
      } catch (error) {
        return res.status(502).json({ error: 'Geocoding service is unavailable', message: error.message });
      }
      if (!coordinates) {
        return res.status(404).json({ error: `Could not find a location matching "${query}"` });
      }

      const [openMeteo, nasaPower] = await fetchSnapshots(coordinates);
      const summary = summarizeRegion({ name, query, ...coordinates }, openMeteo, nasaPower);
      if (!summary.live) {
        return res.status(503).json({ error: 'Live weather data is unavailable right now, so the region was not added. Try again shortly.' });
      }
      res.status(201).json(await store.addRegion(summary));
    } catch (error) {
      res.status(500).json({ error: 'Failed to add region', message: error.message });
    }
  });
}
