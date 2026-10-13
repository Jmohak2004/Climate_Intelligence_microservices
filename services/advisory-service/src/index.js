import { createCollection, startService } from '../../common/src/index.js';

const ADVISORY_SEED = [
  {
    id: 'adv-1',
    title: 'Prevent Heat Stroke & Heat Exhaustion',
    category: 'Medical',
    severity: 'Critical',
    targetAudience: 'General Public & Outdoor Workers',
    content: 'Drink at least 3-4 liters of water daily. Avoid alcohol, caffeine, and carbonated drinks. Wear lightweight, loose, light-colored cotton clothing.',
    doList: ['Stay hydrated with ORS, buttermilk, or lemon water', 'Cover your head with a cloth or umbrella when outside', 'Keep animals in shaded areas with fresh water'],
    dontList: ['Do not step out between 12:00 PM and 3:30 PM', 'Do not leave children or pets inside parked vehicles', 'Do not consume high-protein foods during heat peaks']
  },
  {
    id: 'adv-2',
    title: 'Agricultural & Livestock Heat Protection',
    category: 'Agriculture',
    severity: 'High',
    targetAudience: 'Farmers & Livestock Keepers',
    content: 'Schedule crop irrigation during early morning or evening hours to prevent water loss via evaporation. Provide cooling sheds and water sprayers for cattle.',
    doList: ['Apply mulch to retain soil moisture', 'Provide continuous clean drinking water for poultry & livestock', 'Use shade nets for delicate nurseries'],
    dontList: ['Avoid spraying pesticides during maximum daylight temperatures', 'Do not overcrowd animal shelters']
  },
  {
    id: 'adv-3',
    title: 'Urban Heat Island Mitigation',
    category: 'Urban Planning',
    severity: 'Moderate',
    targetAudience: 'Municipal & Field Workers',
    content: 'Deploy water sprinkling trucks across major asphalt corridors and high-density markets. Keep community cooling shelters open 24/7.',
    doList: ['Set up hydration booths at bus stops and metro hubs', 'Paint roofs with reflective white thermal paint (Cool Roofs)', 'Ensure public parks remain open during daytime hours'],
    dontList: ['Avoid unnecessary outdoor construction during peak afternoon hours', 'Do not burn organic waste in urban centers']
  }
];

// Placeholder registry: the places are real, the names, capacities and occupancy are samples
// until operators register actual centres. 112/108 are India's national emergency numbers.
const COOLING_CENTER_SEED = [
  { id: 'r1', name: 'Central District Cooling Hub #1', type: 'Cooling Shelter', address: 'Connaught Place, New Delhi', capacity: 350, currentOccupancy: 120, status: 'Active', contacts: '112 (emergency) · 108 (ambulance)', sample: true },
  { id: 'r2', name: 'Vidarbha Heat Relief Camp', type: 'Hydration Station', address: 'Sitabuldi, Nagpur', capacity: 600, currentOccupancy: 280, status: 'Active', contacts: '112 (emergency) · 108 (ambulance)', sample: true },
  { id: 'r3', name: 'Pink City Thermal Protection Center', type: 'Medical Emergency Ward', address: 'MI Road, Jaipur', capacity: 200, currentOccupancy: 95, status: 'Active', contacts: '112 (emergency) · 108 (ambulance)', sample: true },
  { id: 'r4', name: 'Yamuna Bank Water & Shelter Unit', type: 'Cooling Shelter', address: 'Kashmere Gate, Delhi', capacity: 450, currentOccupancy: 310, status: 'Active', contacts: '112 (emergency) · 108 (ambulance)', sample: true }
];

const advisories = createCollection('advisories', ADVISORY_SEED);
const coolingCenters = createCollection('cooling_centers', COOLING_CENTER_SEED);

await startService({
  name: 'advisory-service',
  port: Number(process.env.PORT) || 3003,
  collections: [advisories, coolingCenters],
  routes(app) {
    app.get('/api/health-advisories', async (_req, res) => {
      try {
        res.json(await advisories.list());
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    app.post('/api/health-advisories', async (req, res) => {
      try {
        res.status(201).json(await advisories.insert({ id: `adv-${Date.now()}`, ...req.body }));
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    app.get('/api/resources', async (_req, res) => {
      try {
        res.json(await coolingCenters.list());
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    app.post('/api/resources', async (req, res) => {
      try {
        res.status(201).json(await coolingCenters.insert({ id: `r-${Date.now()}`, ...req.body }));
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    app.put('/api/resources/:id/occupancy', async (req, res) => {
      try {
        const updated = await coolingCenters.update(
          { id: req.params.id },
          { currentOccupancy: Number(req.body.currentOccupancy) }
        );
        if (updated) {
          res.json(updated);
        } else {
          res.status(404).json({ error: 'Cooling center not found' });
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  }
});
