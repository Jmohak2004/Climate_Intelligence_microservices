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
  deleteAlert,
  getRegions,
  addRegion
} from './db.js';
import { calculateHeatIndex, getRiskLevel, round } from './heatwave.js';

// Helper to fetch live forecast from Open-Meteo
async function fetchLiveForecast(latitude, longitude) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,uv_index&daily=temperature_2m_max,temperature_2m_min,uv_index_max&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Open-Meteo API returned status ${res.status}`);
  }
  const data = await res.json();
  
  // Format hourly trend (take 6 key points of the day)
  const hourly = data.hourly || {};
  const hourlyTrend = [];
  const hoursToTake = [6, 9, 12, 15, 18, 21];
  
  hoursToTake.forEach((h) => {
    const timeStr = `${h.toString().padStart(2, '0')}:00`;
    const temp = hourly.temperature_2m ? hourly.temperature_2m[h] : 35;
    const humidity = hourly.relative_humidity_2m ? hourly.relative_humidity_2m[h] : 40;
    const heatIndex = calculateHeatIndex(temp, humidity);
    const uv = hourly.uv_index ? Math.round(hourly.uv_index[h]) : 5;
    hourlyTrend.push({ time: timeStr, temp: round(temp, 1), heatIndex: round(heatIndex, 1), uv });
  });

  // Format 7-day forecast
  const daily = data.daily || {};
  const sevenDayForecast = [];
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  for (let i = 0; i < 7; i++) {
    const maxTemp = daily.temperature_2m_max ? daily.temperature_2m_max[i] : 40;
    const minTemp = daily.temperature_2m_min ? daily.temperature_2m_min[i] : 28;
    const avgTemp = (maxTemp + minTemp) / 2;
    // Assume average 40% humidity for risk projection calculation
    const heatIndex = calculateHeatIndex(avgTemp, 40);
    const risk = getRiskLevel(heatIndex);
    sevenDayForecast.push({
      day: days[i],
      maxTemp: round(maxTemp, 1),
      minTemp: round(minTemp, 1),
      heatIndex: round(heatIndex, 1),
      risk
    });
  }

  return { hourlyTrend, sevenDayForecast };
}

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

  // 2. Forecast & Trends Endpoint (supporting dynamic latitude/longitude query)
  app.get('/api/forecast', async (req, res) => {
    const { latitude, longitude, name } = req.query;
    
    // Default coordinates (Delhi) if not provided
    let lat = Number(latitude || 28.6139);
    let lon = Number(longitude || 77.209);

    try {
      const forecastData = await fetchLiveForecast(lat, lon);
      res.json(forecastData);
    } catch (error) {
      console.warn(`Live forecast fetch failed for (${lat}, ${lon}), sending fallback:`, error.message);
      res.json({
        hourlyTrend: [
          { time: '06:00', temp: 28, heatIndex: 30, uv: 2 },
          { time: '09:00', temp: 33, heatIndex: 37, uv: 5 },
          { time: '12:00', temp: 39, heatIndex: 45, uv: 9 },
          { time: '15:00', temp: 42, heatIndex: 48, uv: 10 },
          { time: '18:00', temp: 37, heatIndex: 41, uv: 4 },
          { time: '21:00', temp: 32, heatIndex: 35, uv: 0 }
        ],
        sevenDayForecast: [
          { day: 'Mon', maxTemp: 41, minTemp: 29, heatIndex: 46, risk: 'High' },
          { day: 'Tue', maxTemp: 43, minTemp: 30, heatIndex: 49, risk: 'Severe' },
          { day: 'Wed', maxTemp: 44, minTemp: 31, heatIndex: 51, risk: 'Severe' },
          { day: 'Thu', maxTemp: 40, minTemp: 28, heatIndex: 44, risk: 'Moderate' },
          { day: 'Fri', maxTemp: 38, minTemp: 27, heatIndex: 41, risk: 'Moderate' },
          { day: 'Sat', maxTemp: 39, minTemp: 28, heatIndex: 43, risk: 'Moderate' },
          { day: 'Sun', maxTemp: 42, minTemp: 29, heatIndex: 47, risk: 'High' }
        ]
      });
    }
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

  // 4. Vulnerability & Districts
  app.get('/api/vulnerability', (_req, res) => {
    res.json({
      summary: {
        totalDistricts: 142,
        extremeVulnerability: 18,
        highVulnerability: 44,
        moderateVulnerability: 58,
        lowVulnerability: 22
      },
      districts: [
        { id: 'd1', name: 'Nagpur East', state: 'Maharashtra', population: '2.4M', vulnerabilityScore: 92, riskTier: 'Extreme', coolingCenters: 14, hospitalBeds: 450 },
        { id: 'd2', name: 'Jaipur Urban', state: 'Rajasthan', population: '3.1M', vulnerabilityScore: 88, riskTier: 'Extreme', coolingCenters: 22, hospitalBeds: 620 },
        { id: 'd3', name: 'Delhi North West', state: 'Delhi NCR', population: '3.6M', vulnerabilityScore: 85, riskTier: 'Extreme', coolingCenters: 29, hospitalBeds: 890 },
        { id: 'd4', name: 'Ahmedabad Central', state: 'Gujarat', population: '2.8M', vulnerabilityScore: 79, riskTier: 'High', coolingCenters: 18, hospitalBeds: 540 },
        { id: 'd5', name: 'Lucknow Metro', state: 'Uttar Pradesh', population: '3.4M', vulnerabilityScore: 74, riskTier: 'High', coolingCenters: 16, hospitalBeds: 710 },
        { id: 'd6', name: 'Patna Rural', state: 'Bihar', population: '2.1M', vulnerabilityScore: 71, riskTier: 'High', coolingCenters: 9, hospitalBeds: 320 }
      ]
    });
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
        await updateAWSReading(id, 39.2, 40, 12);
        
        await addSecurityLog(
          'SUCCESS',
          `Station ${station.name} resolved and recalibrated`,
          `Quarantine lifted. Normal telemetry restored.`
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

      // Fetch satellite weather snapshot
      const satUrl = `https://api.open-meteo.com/v1/forecast?latitude=${station.latitude}&longitude=${station.longitude}&current=temperature_2m,relative_humidity_2m&timezone=auto`;
      const satRes = await fetch(satUrl);
      if (!satRes.ok) {
        throw new Error('Failed to fetch satellite validation baseline.');
      }
      const satData = await satRes.json();
      const satTemp = satData.current ? satData.current.temperature_2m : 39.0;
      
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
