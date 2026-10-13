import express from 'express';
import cors from 'cors';
import { getRegions, addRegion, updateRegionWeather, getAlerts } from './db.js';
import { registerClimateRoutes } from './climate.js';
import { registerRegionRoutes } from './regions.js';
import { registerExtraRoutes } from './routes.js';

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

registerExtraRoutes(app);
registerClimateRoutes(app, getRegions);
registerRegionRoutes(app, { getRegions, addRegion, updateRegionWeather, getAlerts });

app.get('/', (_request, response) => {
  response.json({
    status: 'ok',
    message: 'SuryaRakshak API is operational',
    endpoints: ['/api/health', '/api/dashboard', '/api/regions', '/api/forecast', '/api/analytics', '/api/exposure']
  });
});

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok', service: 'suryarakshak-api' });
});

app.listen(port, () => {
  console.log(`SuryaRakshak API listening on port ${port}`);
});
