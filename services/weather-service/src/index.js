import { callService, createCollection, startService } from '../../common/src/index.js';
import { registerClimateRoutes } from './climate.js';
import { registerRegionRoutes } from './regions.js';

const ALERT_SERVICE_URL = process.env.ALERT_SERVICE_URL || 'http://localhost:3002';

// Only the places to monitor are seeded; every reading comes from live APIs.
const regions = createCollection('regions', [
  { name: 'Delhi NCR', query: 'Delhi NCR, India', latitude: 28.6139, longitude: 77.209 },
  { name: 'Jaipur', query: 'Jaipur, Rajasthan, India', latitude: 26.9124, longitude: 75.7873 },
  { name: 'Nagpur', query: 'Nagpur, Maharashtra, India', latitude: 21.1458, longitude: 79.0882 }
]);

const getRegions = () => regions.list();

await startService({
  name: 'weather-service',
  port: Number(process.env.PORT) || 3001,
  collections: [regions],
  routes(app) {
    registerClimateRoutes(app, getRegions);
    registerRegionRoutes(app, {
      getRegions,
      addRegion: (region) => regions.insert(region),
      updateRegionWeather: (name, data) => regions.update({ name }, data),
      // Degrades to "no alerts" if the alert service is down.
      getAlerts: () => callService(ALERT_SERVICE_URL, '/api/alerts', { fallback: [] })
    });

    app.get('/', (_request, response) => {
      response.json({
        status: 'ok',
        message: 'SuryaRakshak weather service is operational',
        endpoints: ['/api/health', '/api/dashboard', '/api/regions', '/api/forecast', '/api/analytics', '/api/exposure']
      });
    });

    app.get('/api/health', (_request, response) => {
      response.json({ status: 'ok', service: 'suryarakshak-api' });
    });
  }
});
