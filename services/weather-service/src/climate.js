import { calculateHeatIndex, round } from './heatwave.js';

// The public APIs we call are occasionally slow or drop a request, so bound each
// attempt with a timeout and retry once before letting callers decide what to do.
export async function fetchJson(url, options = {}, retries = 1) {
  try {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
    if (!response.ok) {
      throw new Error(`Request failed (${response.status}) for ${url}`);
    }
    return await response.json();
  } catch (error) {
    if (retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      return fetchJson(url, options, retries - 1);
    }
    throw error;
  }
}

const DEFAULT_LOCATION = { latitude: 28.6139, longitude: 77.209 };
const ARCHIVE_START = '2016-01-01';
const ARCHIVE_TTL_MS = 6 * 60 * 60 * 1000;
const archiveCache = new Map();

const isoDay = (date) => date.toISOString().slice(0, 10);

function shiftDate(iso, { years = 0, days = 0 } = {}) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCFullYear(date.getUTCFullYear() - years);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDay(date);
}

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const mean = (values) => values.reduce((total, value) => total + value, 0) / values.length;

// Live 7-day forecast and today's hourly trend, straight from Open-Meteo.
export async function fetchLiveForecast(latitude, longitude) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(latitude));
  url.searchParams.set('longitude', String(longitude));
  url.searchParams.set('hourly', 'temperature_2m,relative_humidity_2m,uv_index');
  url.searchParams.set(
    'daily',
    'temperature_2m_max,temperature_2m_min,relative_humidity_2m_min,uv_index_max'
  );
  url.searchParams.set('timezone', 'auto');
  const data = await fetchJson(url.toString());

  const hourly = data.hourly || {};
  const daily = data.daily || {};
  if (!hourly.temperature_2m || !daily.time) {
    throw new Error('Open-Meteo returned an unexpected forecast payload');
  }

  const hourlyTrend = [6, 9, 12, 15, 18, 21]
    .filter((hour) => isNumber(hourly.temperature_2m[hour]) && isNumber(hourly.relative_humidity_2m?.[hour]))
    .map((hour) => {
      const temp = hourly.temperature_2m[hour];
      return {
        time: `${String(hour).padStart(2, '0')}:00`,
        temp: round(temp, 1),
        heatIndex: calculateHeatIndex(temp, hourly.relative_humidity_2m[hour]),
        uv: isNumber(hourly.uv_index?.[hour]) ? Math.round(hourly.uv_index[hour]) : null
      };
    });

  // Daily peak heat index: the day's maximum temperature with the afternoon (lowest) humidity.
  const sevenDayForecast = daily.time
    .map((date, i) => ({ date, i }))
    .filter(({ i }) => isNumber(daily.temperature_2m_max[i]) && isNumber(daily.relative_humidity_2m_min?.[i]))
    .map(({ date, i }) => {
      const heatIndex = calculateHeatIndex(daily.temperature_2m_max[i], daily.relative_humidity_2m_min[i]);
      return {
        date,
        day: new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
        maxTemp: round(daily.temperature_2m_max[i], 1),
        minTemp: round(daily.temperature_2m_min[i], 1),
        humidityMin: Math.round(daily.relative_humidity_2m_min[i]),
        uvMax: isNumber(daily.uv_index_max?.[i]) ? round(daily.uv_index_max[i], 1) : null,
        heatIndex
      };
    });

  return { hourlyTrend, sevenDayForecast, generatedAt: new Date().toISOString() };
}

// Ten years of daily maximum temperature (ERA5 reanalysis via Open-Meteo's archive).
// ERA5 trails real time by about five days, so the window ends six days ago.
export async function getArchive(latitude, longitude) {
  const key = `${latitude.toFixed(2)},${longitude.toFixed(2)}`;
  const cached = archiveCache.get(key);
  if (cached && Date.now() - cached.at < ARCHIVE_TTL_MS) {
    return cached.data;
  }

  const url = new URL('https://archive-api.open-meteo.com/v1/archive');
  url.searchParams.set('latitude', String(latitude));
  url.searchParams.set('longitude', String(longitude));
  url.searchParams.set('start_date', ARCHIVE_START);
  url.searchParams.set('end_date', isoDay(new Date(Date.now() - 6 * 86400000)));
  url.searchParams.set('daily', 'temperature_2m_max');
  url.searchParams.set('timezone', 'auto');
  const payload = await fetchJson(url.toString());
  if (!payload.daily?.time?.length) {
    throw new Error('Open-Meteo archive returned no data');
  }

  const data = { time: payload.daily.time, tmax: payload.daily.temperature_2m_max };
  archiveCache.set(key, { at: Date.now(), data });
  return data;
}

// Last `windowDays` of observed daily maxima against the mean of the same calendar
// days (±halfWindow days) over the preceding `baselineYears` years.
export function buildAnalytics({ time, tmax }, { windowDays = 30, baselineYears = 10, halfWindow = 3 } = {}) {
  const byDate = new Map(time.map((date, i) => [date, tmax[i]]));
  const end = time[time.length - 1];

  const series = [];
  for (let back = windowDays - 1; back >= 0; back--) {
    const date = shiftDate(end, { days: -back });
    const observed = byDate.get(date);
    const samples = [];
    for (let year = 1; year <= baselineYears; year++) {
      for (let offset = -halfWindow; offset <= halfWindow; offset++) {
        const value = byDate.get(shiftDate(date, { years: year, days: offset }));
        if (isNumber(value)) samples.push(value);
      }
    }
    const baseline = samples.length ? round(mean(samples), 1) : null;
    series.push({
      date,
      observed: isNumber(observed) ? round(observed, 1) : null,
      baseline,
      anomaly: isNumber(observed) && baseline !== null ? round(observed - baseline, 1) : null
    });
  }

  const anomalies = series.filter((point) => point.anomaly !== null);
  const hottest = series.filter((point) => point.observed !== null).sort((a, b) => b.observed - a.observed)[0] ?? null;
  const endYear = Number(end.slice(0, 4));

  return {
    period: { start: series[0].date, end },
    baselinePeriod: `${Math.max(endYear - baselineYears, Number(ARCHIVE_START.slice(0, 4)))}–${endYear - 1}`,
    series,
    summary: {
      meanAnomaly: anomalies.length ? round(mean(anomalies.map((point) => point.anomaly)), 1) : null,
      daysAboveBaseline: anomalies.filter((point) => point.anomaly > 0).length,
      daysCompared: anomalies.length,
      hottestDay: hottest && { date: hottest.date, temp: hottest.observed }
    }
  };
}

// How often a location reaches the temperatures India's heat-wave criteria start at.
export function buildExposure({ time, tmax }) {
  const byYear = new Map();
  let hottest = null;

  time.forEach((date, i) => {
    const value = tmax[i];
    if (!isNumber(value)) return;
    const year = Number(date.slice(0, 4));
    const record = byYear.get(year) ?? { days: 0, days40: 0, days45: 0 };
    record.days += 1;
    if (value >= 40) record.days40 += 1;
    if (value >= 45) record.days45 += 1;
    byYear.set(year, record);
    if (!hottest || value > hottest.temp) hottest = { date, temp: round(value, 1) };
  });

  const lastYear = Number(time[time.length - 1].slice(0, 4));
  const fullYears = [...byYear.entries()].filter(([year, record]) => year !== lastYear && record.days >= 360);
  const average = (key) => (fullYears.length ? round(mean(fullYears.map(([, record]) => record[key])), 1) : null);
  const current = byYear.get(lastYear) ?? { days: 0, days40: 0, days45: 0 };

  return {
    yearsAnalysed: fullYears.length,
    avgDaysAbove40: average('days40'),
    avgDaysAbove45: average('days45'),
    currentYear: { year: lastYear, daysObserved: current.days, daysAbove40: current.days40, daysAbove45: current.days45 },
    hottestDay: hottest
  };
}

function parseLocation(query) {
  const latitude = query.latitude === undefined ? DEFAULT_LOCATION.latitude : Number(query.latitude);
  const longitude = query.longitude === undefined ? DEFAULT_LOCATION.longitude : Number(query.longitude);
  const valid = Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
  return valid ? { latitude, longitude } : null;
}

// /api/forecast, /api/analytics and /api/exposure. Any upstream failure is reported
// as a 502 instead of substituting made-up numbers.
export function registerClimateRoutes(app, getRegions) {
  const upstream = (response, what, error) => {
    console.warn(`${what} unavailable:`, error.message);
    response.status(502).json({ error: `${what} is temporarily unavailable`, message: error.message });
  };

  app.get('/api/forecast', async (req, res) => {
    const location = parseLocation(req.query);
    if (!location) return res.status(400).json({ error: 'Invalid latitude/longitude' });
    try {
      res.json(await fetchLiveForecast(location.latitude, location.longitude));
    } catch (error) {
      upstream(res, 'Forecast data', error);
    }
  });

  app.get('/api/analytics', async (req, res) => {
    const location = parseLocation(req.query);
    if (!location) return res.status(400).json({ error: 'Invalid latitude/longitude' });
    try {
      const archive = await getArchive(location.latitude, location.longitude);
      res.json({ ...buildAnalytics(archive), source: 'Open-Meteo Historical Weather API (ERA5 reanalysis)' });
    } catch (error) {
      upstream(res, 'Historical climate data', error);
    }
  });

  app.get('/api/exposure', async (_req, res) => {
    try {
      const regions = await getRegions();
      const results = await Promise.allSettled(
        regions.map(async (region) => ({
          name: region.name,
          latitude: region.latitude,
          longitude: region.longitude,
          ...buildExposure(await getArchive(region.latitude, region.longitude))
        }))
      );
      const rows = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
      const unavailable = regions.filter((_, i) => results[i].status === 'rejected').map((region) => region.name);
      if (!rows.length) {
        return upstream(res, 'Historical climate data', results[0]?.reason ?? new Error('no regions monitored'));
      }
      rows.sort((a, b) => b.avgDaysAbove40 - a.avgDaysAbove40);
      res.json({
        regions: rows,
        unavailable,
        source: 'Open-Meteo Historical Weather API (ERA5 reanalysis)',
        period: `${ARCHIVE_START} to ${isoDay(new Date(Date.now() - 6 * 86400000))}`
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}
