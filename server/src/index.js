import express from 'express';
import cors from 'cors';
import {
  buildAdvisories,
  buildNotifications,
  calculateHeatIndex,
  getRiskLevel,
  round
} from './heatwave.js';
import {
  getRegions,
  addRegion,
  updateRegionWeather,
  getAlerts
} from './db.js';

const app = express();
const port = process.env.PORT || 3001;

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`Request failed for ${url}`);
  }
  return response.json();
}

const REGION_COORDINATES = {
  'Delhi NCR, India': { latitude: 28.6139, longitude: 77.209 },
  'Jaipur, Rajasthan, India': { latitude: 26.9124, longitude: 75.7873 },
  'Nagpur, Maharashtra, India': { latitude: 21.1458, longitude: 79.0882 }
};

async function getCoordinates(query) {
  if (REGION_COORDINATES[query]) {
    return REGION_COORDINATES[query];
  }

  try {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', '1');

    const data = await fetchJson(url.toString(), {
      headers: {
        'User-Agent': 'SuryaRakshak-Heatwave-Monitor/1.0 (https://github.com/Jmohak2004/LY)'
      }
    });

    const first = data[0];
    if (first) {
      return {
        latitude: Number(first.lat),
        longitude: Number(first.lon)
      };
    }
  } catch (err) {
    console.warn(`Geocoding failed for ${query}, using default:`, err.message);
  }

  return { latitude: 28.6139, longitude: 77.209 };
}

async function getWeatherSnapshot(latitude, longitude) {
  try {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', latitude.toString());
    url.searchParams.set('longitude', longitude.toString());
    url.searchParams.set('current', 'temperature_2m,relative_humidity_2m,apparent_temperature');
    url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min,uv_index_max');
    url.searchParams.set('timezone', 'auto');

    return await fetchJson(url.toString());
  } catch (error) {
    console.warn(`Open-Meteo fetch failed for (${latitude}, ${longitude}):`, error.message);
    return {
      current: {
        temperature_2m: 39.0,
        relative_humidity_2m: 40,
        apparent_temperature: 44.0
      }
    };
  }
}

async function getNasaPowerSnapshot(latitude, longitude) {
  try {
    const start = new Date();
    const end = new Date();
    const startString = start.toISOString().slice(0, 10).replace(/-/g, '');
    const endString = end.toISOString().slice(0, 10).replace(/-/g, '');
    const url = new URL('https://power.larc.nasa.gov/api/temporal/daily/point');
    url.searchParams.set('parameters', 'T2M_MAX,T2M_MIN,ALLSKY_SFC_SW_DWN');
    url.searchParams.set('community', 'RE');
    url.searchParams.set('longitude', longitude.toString());
    url.searchParams.set('latitude', latitude.toString());
    url.searchParams.set('start', startString);
    url.searchParams.set('end', endString);
    url.searchParams.set('format', 'JSON');

    return await fetchJson(url.toString());
  } catch (error) {
    console.warn('NASA POWER API request failed:', error.message);
    return null;
  }
}

function summarizeRegion(region, openMeteoData, nasaData) {
  const current = openMeteoData.current || {};
  const humidity = Number(current.relative_humidity_2m ?? 40);
  const temperature = Number(current.temperature_2m ?? 38);
  const heatIndex = calculateHeatIndex(temperature, humidity);
  const riskLevel = getRiskLevel(heatIndex);
  const nasaParameters = nasaData?.properties?.parameter || {};
  const firstNasaKey = Object.keys(nasaParameters)[0];
  const nasaValue = firstNasaKey ? nasaParameters[firstNasaKey][Object.keys(nasaParameters[firstNasaKey])[0]] : null;

  return {
    name: region.name,
    query: region.query,
    latitude: round(region.latitude, 4),
    longitude: round(region.longitude, 4),
    temperature: round(temperature, 1),
    humidity: round(humidity, 0),
    apparentTemperature: round(Number(current.apparent_temperature ?? heatIndex), 1),
    heatIndex,
    riskLevel,
    populationAtRisk: region.populationAtRisk || '800K',
    summary: `${region.name} is currently at ${riskLevel.toLowerCase()} heat risk.`,
    nassaPowerDaily: nasaValue ?? null,
    advisories: buildAdvisories({ name: region.name, riskLevel })
  };
}

async function buildRegionData(region) {
  const coordinates = region.latitude && region.longitude ? region : await getCoordinates(region.query);
  const [openMeteoData, nasaData] = await Promise.all([
    getWeatherSnapshot(coordinates.latitude, coordinates.longitude),
    getNasaPowerSnapshot(coordinates.latitude, coordinates.longitude)
  ]);

  return summarizeRegion(
    {
      ...region,
      ...coordinates
    },
    openMeteoData,
    nasaData
  );
}

import { registerExtraRoutes } from './routes.js';

app.use(cors());
app.use(express.json());

registerExtraRoutes(app);

app.get('/', (_request, response) => {
  response.json({ status: 'ok', message: 'SuryaRakshak API is operational', endpoints: ['/api/health', '/api/dashboard', '/api/regions'] });
});

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok', service: 'suryarakshak-api' });
});

function getMockDashboardData() {
  const mockRegions = [
    {
      name: 'Delhi NCR',
      query: 'Delhi NCR, India',
      latitude: 28.6139,
      longitude: 77.209,
      temperature: 38.5,
      humidity: 42,
      apparentTemperature: 43.1,
      heatIndex: 44.2,
      riskLevel: 'Moderate',
      populationAtRisk: '1.2M',
      summary: 'Delhi NCR is currently at moderate heat risk.',
      nassaPowerDaily: null,
      advisories: buildAdvisories({ name: 'Delhi NCR', riskLevel: 'Moderate' })
    },
    {
      name: 'Jaipur',
      query: 'Jaipur, Rajasthan, India',
      latitude: 26.9124,
      longitude: 75.7873,
      temperature: 41.2,
      humidity: 35,
      apparentTemperature: 46.8,
      heatIndex: 47.5,
      riskLevel: 'High',
      populationAtRisk: '850K',
      summary: 'Jaipur is currently at high heat risk.',
      nassaPowerDaily: null,
      advisories: buildAdvisories({ name: 'Jaipur', riskLevel: 'High' })
    },
    {
      name: 'Nagpur',
      query: 'Nagpur, Maharashtra, India',
      latitude: 21.1458,
      longitude: 79.0882,
      temperature: 42.0,
      humidity: 38,
      apparentTemperature: 48.0,
      heatIndex: 49.1,
      riskLevel: 'High',
      populationAtRisk: '950K',
      summary: 'Nagpur is currently at high heat risk.',
      nassaPowerDaily: null,
      advisories: buildAdvisories({ name: 'Nagpur', riskLevel: 'High' })
    }
  ];

  return {
    summary: {
      activeAlerts: 2,
      highRiskDistricts: 2,
      averageHeatIndex: 46.9
    },
    regions: mockRegions,
    notifications: buildNotifications(mockRegions),
    alerts: [],
    generatedAt: new Date().toISOString(),
    sources: ['Open-Meteo (Fallback)', 'Nominatim']
  };
}

app.get('/api/dashboard', async (_request, response) => {
  try {
    const dbRegions = await getRegions();
    const regionsData = await Promise.all(dbRegions.map(async (region) => {
      try {
        const coordinates = { latitude: region.latitude, longitude: region.longitude };
        const [openMeteoData, nasaData] = await Promise.all([
          getWeatherSnapshot(coordinates.latitude, coordinates.longitude),
          getNasaPowerSnapshot(coordinates.latitude, coordinates.longitude)
        ]);
        const updated = summarizeRegion(region, openMeteoData, nasaData);
        await updateRegionWeather(region.name, updated);
        return updated;
      } catch (err) {
        console.warn(`Failed to update weather for ${region.name}:`, err.message);
        return region;
      }
    }));

    const activeAlerts = await getAlerts();
    const summary = {
      activeAlerts: regionsData.filter((region) => region.riskLevel === 'Severe' || region.riskLevel === 'High').length + activeAlerts.length,
      highRiskDistricts: regionsData.filter((region) => region.riskLevel === 'Severe' || region.riskLevel === 'High').length,
      averageHeatIndex: round(
        regionsData.reduce((total, region) => total + region.heatIndex, 0) / regionsData.length,
        1
      )
    };

    response.json({
      summary,
      regions: regionsData,
      notifications: buildNotifications(regionsData),
      alerts: activeAlerts,
      generatedAt: new Date().toISOString(),
      sources: ['Open-Meteo', 'NASA POWER', 'Nominatim']
    });
  } catch (error) {
    console.error('Error fetching live heatwave data, sending fallback payload:', error.message);
    response.json(getMockDashboardData());
  }
});

app.get('/api/regions', async (_request, response) => {
  try {
    const dbRegions = await getRegions();
    response.json(dbRegions);
  } catch (error) {
    response.status(500).json({
      error: 'Failed to load live region data',
      message: error.message
    });
  }
});

app.post('/api/regions', async (req, res) => {
  const { query, name } = req.body;
  if (!query || !name) {
    return res.status(400).json({ error: 'Missing query or name' });
  }

  try {
    const existing = await getRegions();
    if (existing.find(r => r.name.toLowerCase() === name.toLowerCase())) {
      return res.status(400).json({ error: 'Region already monitored.' });
    }

    const coordinates = await getCoordinates(query);
    const regionObj = {
      name,
      query,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      populationAtRisk: '500K',
      riskLevel: 'Low',
      temperature: 35,
      humidity: 40,
      apparentTemperature: 35,
      heatIndex: 35,
      summary: `${name} initialized.`
    };

    const initialData = await buildRegionData(regionObj);
    const added = await addRegion(initialData);
    res.status(201).json(added);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add region', message: error.message });
  }
});

app.listen(port, () => {
  console.log(`SuryaRakshak API listening on port ${port}`);
});