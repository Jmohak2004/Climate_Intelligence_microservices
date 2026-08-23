import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Default Seed Data
const DEFAULT_REGIONS = [
  { name: 'Delhi NCR', query: 'Delhi NCR, India', latitude: 28.6139, longitude: 77.209, populationAtRisk: '1.2M', riskLevel: 'Moderate', temperature: 38.5, humidity: 42, apparentTemperature: 43.1, heatIndex: 44.2, summary: 'Delhi NCR is currently at moderate heat risk.' },
  { name: 'Jaipur', query: 'Jaipur, Rajasthan, India', latitude: 26.9124, longitude: 75.7873, populationAtRisk: '850K', riskLevel: 'High', temperature: 41.2, humidity: 35, apparentTemperature: 46.8, heatIndex: 47.5, summary: 'Jaipur is currently at high heat risk.' },
  { name: 'Nagpur', query: 'Nagpur, Maharashtra, India', latitude: 21.1458, longitude: 79.0882, populationAtRisk: '950K', riskLevel: 'High', temperature: 42.0, humidity: 38, apparentTemperature: 48.0, heatIndex: 49.1, summary: 'Nagpur is currently at high heat risk.' }
];

const DEFAULT_ADVISORIES = [
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

const DEFAULT_COOLING_CENTERS = [
  { id: 'r1', name: 'Central District Cooling Hub #1', type: 'Cooling Shelter', address: 'Connaught Place Sector 4, New Delhi', capacity: 350, currentOccupancy: 120, status: 'Active', contacts: '+91 11 2345 6789' },
  { id: 'r2', name: 'Vidarbha Heat Relief Camp', type: 'Hydration Station', address: 'Sitabuldi Interchange, Nagpur', capacity: 600, currentOccupancy: 280, status: 'Active', contacts: '+91 712 987 6543' },
  { id: 'r3', name: 'Pink City Thermal Protection Center', type: 'Medical Emergency Ward', address: 'MI Road, Jaipur', capacity: 200, currentOccupancy: 95, status: 'Active', contacts: '+91 141 555 0199' },
  { id: 'r4', name: 'Yamuna Bank Water & Shelter Unit', type: 'Cooling Shelter', address: 'Kashmere Gate, Delhi', capacity: 450, currentOccupancy: 310, status: 'Active', contacts: '+91 11 8888 2222' }
];

const DEFAULT_AWS_STATIONS = [
  { id: 'aws-1', name: 'Delhi North-West Station', region: 'Delhi NCR', latitude: 28.7041, longitude: 77.1025, status: 'Active', temperature: 38.2, humidity: 41, windSpeed: 12, lastUpdated: new Date().toISOString() },
  { id: 'aws-2', name: 'Jaipur Sanganer Airport Station', region: 'Jaipur', latitude: 26.8284, longitude: 75.8056, status: 'Active', temperature: 40.8, humidity: 36, windSpeed: 14, lastUpdated: new Date().toISOString() },
  { id: 'aws-3', name: 'Nagpur Airport Station', region: 'Nagpur', latitude: 21.0922, longitude: 79.0472, status: 'Active', temperature: 41.9, humidity: 39, windSpeed: 10, lastUpdated: new Date().toISOString() }
];

const DEFAULT_SECURITY_LOGS = [
  { id: 'log-1', timestamp: new Date(Date.now() - 3600000).toISOString(), type: 'INFO', event: 'System startup: AWS validation framework enabled', details: 'Configured z-score threshold: 3.5' },
  { id: 'log-2', timestamp: new Date(Date.now() - 3000000).toISOString(), type: 'SUCCESS', event: 'Delhi North-West Station validated', details: 'Variance from satellite: +0.3°C (Status: VALID)' },
  { id: 'log-3', timestamp: new Date(Date.now() - 2400000).toISOString(), type: 'SUCCESS', event: 'Jaipur Sanganer Airport Station validated', details: 'Variance from satellite: -0.4°C (Status: VALID)' }
];

const DEFAULT_ALERTS = [
  { id: 'alert-1', region: 'Jaipur', severity: 'High', title: 'Jaipur Regional Alert', message: 'High thermal stress observed in Jaipur. Public advisory active.', timestamp: new Date().toISOString() }
];

// Initialize Database Object
let dbState = {
  regions: [...DEFAULT_REGIONS],
  advisories: [...DEFAULT_ADVISORIES],
  coolingCenters: [...DEFAULT_COOLING_CENTERS],
  awsStations: [...DEFAULT_AWS_STATIONS],
  securityLogs: [...DEFAULT_SECURITY_LOGS],
  alerts: [...DEFAULT_ALERTS]
};

// Check if we use MongoDB
const isMongo = !!process.env.MONGODB_URI;

if (isMongo) {
  try {
    mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB connection initialized successfully via Mongoose.');
  } catch (err) {
    console.error('Failed to initialize MongoDB connection:', err.message);
  }
} else {
  // Load from local file if it exists, otherwise write defaults
  if (fs.existsSync(DB_FILE)) {
    try {
      dbState = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      // Ensure all fields exist
      dbState.regions = dbState.regions || [...DEFAULT_REGIONS];
      dbState.advisories = dbState.advisories || [...DEFAULT_ADVISORIES];
      dbState.coolingCenters = dbState.coolingCenters || [...DEFAULT_COOLING_CENTERS];
      dbState.awsStations = dbState.awsStations || [...DEFAULT_AWS_STATIONS];
      dbState.securityLogs = dbState.securityLogs || [...DEFAULT_SECURITY_LOGS];
      dbState.alerts = dbState.alerts || [...DEFAULT_ALERTS];
    } catch (err) {
      console.error('Failed to parse database.json, using defaults:', err.message);
    }
  } else {
    saveLocalDb();
  }
}

function saveLocalDb() {
  if (!isMongo) {
    fs.writeFileSync(DB_FILE, JSON.stringify(dbState, null, 2), 'utf8');
  }
}

// ----------------------------------------------------
// MONGOOSE SCHEMAS (If MongoDB is active)
// ----------------------------------------------------
const regionSchema = new mongoose.Schema({
  name: String, query: String, latitude: Number, longitude: Number, populationAtRisk: String,
  riskLevel: String, temperature: Number, humidity: Number, apparentTemperature: Number, heatIndex: Number, summary: String
});
const RegionModel = isMongo ? mongoose.model('Region', regionSchema) : null;

const advisorySchema = new mongoose.Schema({
  id: String, title: String, category: String, severity: String, targetAudience: String, content: String, doList: [String], dontList: [String]
});
const AdvisoryModel = isMongo ? mongoose.model('Advisory', advisorySchema) : null;

const coolingCenterSchema = new mongoose.Schema({
  id: String, name: String, type: String, address: String, capacity: Number, currentOccupancy: Number, status: String, contacts: String
});
const CoolingCenterModel = isMongo ? mongoose.model('CoolingCenter', coolingCenterSchema) : null;

const awsStationSchema = new mongoose.Schema({
  id: String, name: String, region: String, latitude: Number, longitude: Number, status: String, temperature: Number, humidity: Number, windSpeed: Number, lastUpdated: String
});
const AwsStationModel = isMongo ? mongoose.model('AwsStation', awsStationSchema) : null;

const securityLogSchema = new mongoose.Schema({
  id: String, timestamp: String, type: String, event: String, details: String
});
const SecurityLogModel = isMongo ? mongoose.model('SecurityLog', securityLogSchema) : null;

const alertSchema = new mongoose.Schema({
  id: String, region: String, severity: String, title: String, message: String, timestamp: String
});
const AlertModel = isMongo ? mongoose.model('Alert', alertSchema) : null;

// Seed MongoDB if empty
if (isMongo) {
  mongoose.connection.once('open', async () => {
    try {
      const rCount = await RegionModel.countDocuments();
      if (rCount === 0) {
        await RegionModel.insertMany(DEFAULT_REGIONS);
        await AdvisoryModel.insertMany(DEFAULT_ADVISORIES);
        await CoolingCenterModel.insertMany(DEFAULT_COOLING_CENTERS);
        await AwsStationModel.insertMany(DEFAULT_AWS_STATIONS);
        await SecurityLogModel.insertMany(DEFAULT_SECURITY_LOGS);
        await AlertModel.insertMany(DEFAULT_ALERTS);
        console.log('MongoDB database seeded with defaults.');
      }
    } catch (err) {
      console.error('Failed to seed MongoDB database:', err.message);
    }
  });
}

// ----------------------------------------------------
// DATABASE API EXPORTS
// ----------------------------------------------------

export async function getRegions() {
  if (isMongo) return await RegionModel.find().lean();
  return dbState.regions;
}

export async function addRegion(region) {
  if (isMongo) {
    const doc = new RegionModel(region);
    await doc.save();
    return doc.toObject();
  }
  dbState.regions.push(region);
  saveLocalDb();
  return region;
}

export async function updateRegionWeather(name, data) {
  if (isMongo) {
    return await RegionModel.findOneAndUpdate({ name }, { $set: data }, { new: true });
  }
  const region = dbState.regions.find(r => r.name === name);
  if (region) {
    Object.assign(region, data);
    saveLocalDb();
  }
  return region;
}

export async function getAdvisories() {
  if (isMongo) return await AdvisoryModel.find().lean();
  return dbState.advisories;
}

export async function addAdvisory(advisory) {
  const newAdv = { id: advisory.id || `adv-${Date.now()}`, ...advisory };
  if (isMongo) {
    const doc = new AdvisoryModel(newAdv);
    await doc.save();
    return doc.toObject();
  }
  dbState.advisories.push(newAdv);
  saveLocalDb();
  return newAdv;
}

export async function getCoolingCenters() {
  if (isMongo) return await CoolingCenterModel.find().lean();
  return dbState.coolingCenters;
}

export async function addCoolingCenter(center) {
  const newCenter = { id: center.id || `r-${Date.now()}`, ...center };
  if (isMongo) {
    const doc = new CoolingCenterModel(newCenter);
    await doc.save();
    return doc.toObject();
  }
  dbState.coolingCenters.push(newCenter);
  saveLocalDb();
  return newCenter;
}

export async function updateCoolingCenterOccupancy(id, currentOccupancy) {
  if (isMongo) {
    return await CoolingCenterModel.findOneAndUpdate({ id }, { $set: { currentOccupancy } }, { new: true });
  }
  const center = dbState.coolingCenters.find(c => c.id === id);
  if (center) {
    center.currentOccupancy = Number(currentOccupancy);
    saveLocalDb();
  }
  return center;
}

export async function getAWSStations() {
  if (isMongo) return await AwsStationModel.find().lean();
  return dbState.awsStations;
}

export async function updateAWSReading(id, temperature, humidity, windSpeed) {
  const lastUpdated = new Date().toISOString();
  if (isMongo) {
    return await AwsStationModel.findOneAndUpdate(
      { id },
      { $set: { temperature, humidity, windSpeed, lastUpdated } },
      { new: true }
    );
  }
  const station = dbState.awsStations.find(s => s.id === id);
  if (station) {
    station.temperature = Number(temperature);
    station.humidity = Number(humidity);
    if (windSpeed !== undefined) station.windSpeed = Number(windSpeed);
    station.lastUpdated = lastUpdated;
    saveLocalDb();
  }
  return station;
}

export async function setAWSStatus(id, status) {
  if (isMongo) {
    return await AwsStationModel.findOneAndUpdate({ id }, { $set: { status } }, { new: true });
  }
  const station = dbState.awsStations.find(s => s.id === id);
  if (station) {
    station.status = status;
    saveLocalDb();
  }
  return station;
}

export async function getSecurityLogs() {
  if (isMongo) return await SecurityLogModel.find().lean();
  return dbState.securityLogs;
}

export async function addSecurityLog(type, event, details) {
  const log = {
    id: `log-${Date.now()}`,
    timestamp: new Date().toISOString(),
    type,
    event,
    details
  };
  if (isMongo) {
    const doc = new SecurityLogModel(log);
    await doc.save();
    return doc.toObject();
  }
  dbState.securityLogs.unshift(log);
  if (dbState.securityLogs.length > 50) {
    dbState.securityLogs = dbState.securityLogs.slice(0, 50);
  }
  saveLocalDb();
  return log;
}

export async function getAlerts() {
  if (isMongo) return await AlertModel.find().lean();
  return dbState.alerts;
}

export async function addAlert(alert) {
  const newAlert = {
    id: alert.id || `alert-${Date.now()}`,
    timestamp: new Date().toISOString(),
    ...alert
  };
  if (isMongo) {
    const doc = new AlertModel(newAlert);
    await doc.save();
    return doc.toObject();
  }
  dbState.alerts.unshift(newAlert);
  saveLocalDb();
  return newAlert;
}

export async function deleteAlert(id) {
  if (isMongo) {
    await AlertModel.deleteOne({ id });
    return true;
  }
  dbState.alerts = dbState.alerts.filter(a => a.id !== id);
  saveLocalDb();
  return true;
}
