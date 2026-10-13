import { callService, createCollection, startService } from '../../common/src/index.js';

// Bounded, retrying fetch for the Open-Meteo baseline.
async function fetchJson(url, retries = 1) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
    return await response.json();
  } catch (error) {
    if (retries > 0) return fetchJson(url, retries - 1);
    throw error;
  }
}

const ALERT_SERVICE_URL = process.env.ALERT_SERVICE_URL || 'http://localhost:3002';
const MAX_LOGS = 50;

const STATION_SEED = [
  { id: 'aws-1', name: 'Delhi North-West Station', region: 'Delhi NCR', latitude: 28.7041, longitude: 77.1025, status: 'Active', temperature: null, humidity: null, windSpeed: null, lastUpdated: null, simulated: true },
  { id: 'aws-2', name: 'Jaipur Sanganer Airport Station', region: 'Jaipur', latitude: 26.8284, longitude: 75.8056, status: 'Active', temperature: null, humidity: null, windSpeed: null, lastUpdated: null, simulated: true },
  { id: 'aws-3', name: 'Nagpur Airport Station', region: 'Nagpur', latitude: 21.0922, longitude: 79.0472, status: 'Active', temperature: null, humidity: null, windSpeed: null, lastUpdated: null, simulated: true }
];

const SECURITY_LOG_SEED = [
  { id: 'log-1', timestamp: new Date().toISOString(), type: 'INFO', event: 'System startup: AWS validation framework enabled', details: 'Readings are flagged when they differ from the Open-Meteo baseline by more than 5.0°C' }
];

const stations = createCollection('aws_stations', STATION_SEED);
const securityLogs = createCollection('security_logs', SECURITY_LOG_SEED);

const round = (value, digits = 0) => Number(Number(value).toFixed(digits));

async function addSecurityLog(type, event, details) {
  return securityLogs.insert({ id: `log-${Date.now()}`, timestamp: new Date().toISOString(), type, event, details });
}

function setReading(id, temperature, humidity, windSpeed) {
  const num = (value) => (value == null ? null : Number(value));
  const patch = { temperature: num(temperature), humidity: num(humidity), lastUpdated: new Date().toISOString() };
  if (windSpeed !== undefined) patch.windSpeed = num(windSpeed);
  return stations.update({ id }, patch);
}

await startService({
  name: 'aws-service',
  port: Number(process.env.PORT) || 3004,
  collections: [stations, securityLogs],
  routes(app) {
    const handle = (fn) => async (req, res) => {
      try {
        await fn(req, res);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    };

    app.get('/api/aws/stations', handle(async (_req, res) => {
      res.json(await stations.list());
    }));

    app.post('/api/aws/stations/:id/reading', handle(async (req, res) => {
      const { temperature, humidity, windSpeed } = req.body;
      res.json(await setReading(req.params.id, temperature, humidity, windSpeed));
    }));

    app.get('/api/aws/security-logs', handle(async (_req, res) => {
      const logs = await securityLogs.list();
      res.json(logs.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp))).slice(0, MAX_LOGS));
    }));

    // Cyber attack simulation
    app.post('/api/aws/simulate-attack', handle(async (req, res) => {
      const station = await stations.update({ id: req.body.id }, { status: 'Tampered' });
      if (!station) return res.status(404).json({ error: 'Station not found' });

      await setReading(station.id, 58.5, 95, 2);
      await addSecurityLog(
        'WARNING',
        `Data anomaly simulation active for ${station.name}`,
        'Injecting malicious telemetry (Temp: 58.5°C, Hum: 95%)'
      );
      res.json({ success: true, station });
    }));

    // Quarantine / recalibrate
    app.post('/api/aws/quarantine', handle(async (req, res) => {
      const station = await stations.update({ id: req.body.id }, { status: 'Active' });
      if (!station) return res.status(404).json({ error: 'Station not found' });

      await setReading(station.id, null, null, null);
      await addSecurityLog(
        'SUCCESS',
        `Station ${station.name} resolved and recalibrated`,
        'Quarantine lifted. Tampered readings cleared; awaiting fresh telemetry.'
      );
      res.json({ success: true, station });
    }));

    // Compare reported sensor data with Open-Meteo satellite data
    app.post('/api/aws/validate', async (req, res) => {
      try {
        const station = await stations.findOne({ id: req.body.id });
        if (!station) return res.status(404).json({ error: 'AWS Station not found' });

        const satUrl = `https://api.open-meteo.com/v1/forecast?latitude=${station.latitude}&longitude=${station.longitude}&current=temperature_2m,relative_humidity_2m&timezone=auto`;
        const satData = await fetchJson(satUrl);
        const satTemp = satData.current?.temperature_2m;
        if (typeof satTemp !== 'number') throw new Error('Satellite validation baseline is unavailable.');

        if (typeof station.temperature !== 'number') {
          return res.status(409).json({ error: `${station.name} has not reported any telemetry yet.` });
        }

        const reportedTemp = station.temperature;
        const variance = Math.abs(reportedTemp - satTemp);
        let validationStatus = 'VALID';

        if (variance > 5.0 || station.status === 'Tampered') {
          validationStatus = 'TAMPERED';
          await stations.update({ id: station.id }, { status: 'Tampered' });
          await addSecurityLog(
            'CRITICAL',
            `Cyber Anomaly Detected: Data Tampering on ${station.name}`,
            `Reported Temp: ${reportedTemp}°C, Satellite Baseline: ${round(satTemp, 1)}°C (Variance: ${round(variance, 1)}°C > Threshold: 5.0°C). Station status changed to TAMPERED.`
          );
          // Raise a push-notification alert via the alert service (best effort).
          await callService(ALERT_SERVICE_URL, '/api/alerts', {
            method: 'POST',
            body: {
              region: station.region,
              severity: 'Severe',
              title: `Security Anomaly: ${station.name}`,
              message: `Station ${station.name} flagged for anomalous temperature readings (variance: ${round(variance, 1)}°C).`
            }
          });
        } else {
          await addSecurityLog(
            'SUCCESS',
            `Telemetry Validation: Passed for ${station.name}`,
            `Reported Temp: ${reportedTemp}°C, Satellite Baseline: ${round(satTemp, 1)}°C (Variance: ${round(variance, 1)}°C).`
          );
        }

        res.json({
          stationName: station.name,
          reportedTemp,
          satelliteBaseline: round(satTemp, 1),
          variance: round(variance, 1),
          status: validationStatus
        });
      } catch (error) {
        console.error('Validation route error:', error.message);
        res.status(500).json({ error: 'Validation failed', message: error.message });
      }
    });
  }
});
