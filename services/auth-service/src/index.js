import { startService } from '../../common/src/index.js';

// Demo credentials, same as the original monolith.
const USERS = {
  director: { password: 'admin', token: 'sess-director', role: 'Authority', name: 'Director KJS-CES' },
  farmer: { password: 'agri', token: 'sess-farmer', role: 'Agriculturalist', name: 'Agri Expert' },
  health: { password: 'health', token: 'sess-health', role: 'Health Worker', name: 'Dr. Sharma' },
  citizen: { password: 'citizen', token: 'sess-citizen', role: 'Citizen', name: 'Rajesh Kumar' }
};

await startService({
  name: 'auth-service',
  port: Number(process.env.PORT) || 3005,
  routes(app) {
    app.post('/api/auth/login', (req, res) => {
      const { username, password } = req.body ?? {};
      const user = Object.hasOwn(USERS, username) ? USERS[username] : null;
      if (user && user.password === password) {
        res.json({ token: user.token, user: { username, role: user.role, name: user.name } });
      } else {
        res.status(401).json({ error: 'Invalid credentials. Choose director/admin, farmer/agri, health/health, or citizen/citizen.' });
      }
    });

    app.post('/api/auth/logout', (_req, res) => {
      res.json({ success: true, message: 'Logged out successfully.' });
    });
  }
});
