import {
  getAdvisories,
  addAdvisory,
  getCoolingCenters,
  addCoolingCenter,
  updateCoolingCenterOccupancy,
  getAWSStations,
  updateAWSReading,
  setAWSStatus,
  getSecurityLogs,
  addSecurityLog,
  getAlerts,
  addAlert,
  deleteAlert
} from './db.js';
import { round } from './heatwave.js';
import { fetchJson } from './climate.js';

export function registerExtraRoutes(app) {
  // 1. Authentication & Session Endpoint
  app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'director' && password === 'admin') {
      res.json({
        token: 'sess-director',
        user: { username: 'director', role: 'Authority', name: 'Director KJS-CES' }
      });
    } else if (username === 'farmer' && password === 'agri') {
      res.json({
        token: 'sess-farmer',
        user: { username: 'farmer', role: 'Agriculturalist', name: 'Agri Expert' }
      });
    } else if (username === 'health' && password === 'health') {
      res.json({
        token: 'sess-health',
        user: { username: 'health', role: 'Health Worker', name: 'Dr. Sharma' }
      });
    } else if (username === 'citizen' && password === 'citizen') {
      res.json({
        token: 'sess-citizen',
        user: { username: 'citizen', role: 'Citizen', name: 'Rajesh Kumar' }
      });
    } else {
      res.status(401).json({ error: 'Invalid credentials. Choose director/admin, farmer/agri, health/health, or citizen/citizen.' });
    }
  });

  app.post('/api/auth/logout', (_req, res) => {
    res.json({ success: true, message: 'Logged out successfully.' });
  });

  // 3. Health Advisories CRUD
  app.get('/api/health-advisories', async (_req, res) => {
    try {
      const advisories = await getAdvisories();
      res.json(advisories);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/health-advisories', async (req, res) => {
    try {
      const newAdv = await addAdvisory(req.body);
      res.status(201).json(newAdv);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // 5. Cooling Centers CRUD
  app.get('/api/resources', async (_req, res) => {
    try {
      const resources = await getCoolingCenters();
      res.json(resources);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/resources', async (req, res) => {
    try {
      const newCenter = await addCoolingCenter(req.body);
      res.status(201).json(newCenter);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/resources/:id/occupancy', async (req, res) => {
    const { id } = req.params;
    const { currentOccupancy } = req.body;
    try {
      const updated = await updateCoolingCenterOccupancy(id, currentOccupancy);
      if (updated) {
        res.json(updated);
      } else {
        res.status(404).json({ error: 'Cooling center not found' });
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // 6. IoT AWS Station Endpoints
  app.get('/api/aws/stations', async (_req, res) => {
    try {
      const stations = await getAWSStations();
      res.json(stations);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/aws/stations/:id/reading', async (req, res) => {
    const { id } = req.params;
    const { temperature, humidity, windSpeed } = req.body;
    try {
      const updated = await updateAWSReading(id, temperature, humidity, windSpeed);
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/aws/security-logs', async (_req, res) => {
    try {
      const logs = await getSecurityLogs();
      res.json(logs);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Cyber attack simulation
  app.post('/api/aws/simulate-attack', async (req, res) => {
    const { id } = req.body;
    try {
      const station = await setAWSStatus(id, 'Tampered');
      if (station) {
        // Inject extreme bad temperature values
        await updateAWSReading(id, 58.5, 95, 2);
        
        await addSecurityLog(
          'WARNING',
          `Data anomaly simulation active for ${station.name}`,
          `Injecting malicious telemetry (Temp: 58.5°C, Hum: 95%)`
        );
        
        res.json({ success: true, station });
      } else {
        res.status(404).json({ error: 'Station not found' });
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Quarantine / recalibrate
  app.post('/api/aws/quarantine', async (req, res) => {
    const { id } = req.body;
    try {
      const station = await setAWSStatus(id, 'Active');
      if (station) {
        // Reset to normal reading
        await updateAWSReading(id, null, null, null);
        
        await addSecurityLog(
          'SUCCESS',
          `Station ${station.name} resolved and recalibrated`,
          `Quarantine lifted. Tampered readings cleared; awaiting fresh telemetry.`
        );
        
        res.json({ success: true, station });
      } else {
        res.status(404).json({ error: 'Station not found' });
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Validation endpoint comparing reported sensor data with open-meteo satellite data
  app.post('/api/aws/validate', async (req, res) => {
    const { id } = req.body;
    try {
      const stations = await getAWSStations();
      const station = stations.find((s) => s.id === id);
      if (!station) {
        return res.status(404).json({ error: 'AWS Station not found' });
      }

      // Fetch satellite weather snapshot (no made-up baseline if it can't be fetched)
      const satUrl = `https://api.open-meteo.com/v1/forecast?latitude=${station.latitude}&longitude=${station.longitude}&current=temperature_2m,relative_humidity_2m&timezone=auto`;
      const satData = await fetchJson(satUrl);
      const satTemp = satData.current?.temperature_2m;
      if (typeof satTemp !== 'number') {
        throw new Error('Satellite validation baseline is unavailable.');
      }
      
      if (typeof station.temperature !== 'number') {
        return res.status(409).json({ error: `${station.name} has not reported any telemetry yet.` });
      }

      const reportedTemp = station.temperature;
      const variance = Math.abs(reportedTemp - satTemp);
      
      let validationStatus = 'VALID';
      
      // If variance is too high (compromised/tampered data)
      if (variance > 5.0 || station.status === 'Tampered') {
        validationStatus = 'TAMPERED';
        await setAWSStatus(id, 'Tampered');
        
        // Log critical security event
        await addSecurityLog(
          'CRITICAL',
          `Cyber Anomaly Detected: Data Tampering on ${station.name}`,
          `Reported Temp: ${reportedTemp}°C, Satellite Baseline: ${round(satTemp, 1)}°C (Variance: ${round(variance, 1)}°C > Threshold: 5.0°C). Station status changed to TAMPERED.`
        );

        // Add a push notification alert to DB
        await addAlert({
          region: station.region,
          severity: 'Severe',
          title: `Security Anomaly: ${station.name}`,
          message: `Station ${station.name} flagged for anomalous temperature readings (variance: ${round(variance, 1)}°C).`
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

  // Alert management endpoints
  app.get('/api/alerts', async (_req, res) => {
    try {
      const alerts = await getAlerts();
      res.json(alerts);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/alerts', async (req, res) => {
    try {
      const alert = await addAlert(req.body);
      res.status(201).json(alert);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/alerts/:id', async (req, res) => {
    try {
      await deleteAlert(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}
