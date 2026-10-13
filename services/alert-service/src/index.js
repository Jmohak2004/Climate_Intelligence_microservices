import { createCollection, startService } from '../../common/src/index.js';

const alerts = createCollection('alerts', []);

const newestFirst = (a, b) => String(b.timestamp).localeCompare(String(a.timestamp));

await startService({
  name: 'alert-service',
  port: Number(process.env.PORT) || 3002,
  collections: [alerts],
  routes(app) {
    app.get('/api/alerts', async (_req, res) => {
      try {
        res.json((await alerts.list()).sort(newestFirst));
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    app.post('/api/alerts', async (req, res) => {
      try {
        const alert = await alerts.insert({
          id: req.body.id || `alert-${Date.now()}`,
          timestamp: new Date().toISOString(),
          ...req.body
        });
        res.status(201).json(alert);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    app.delete('/api/alerts/:id', async (req, res) => {
      try {
        await alerts.remove({ id: req.params.id });
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  }
});
