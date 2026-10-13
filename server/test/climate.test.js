import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAnalytics, buildExposure } from '../src/climate.js';
import { summarizeRegion } from '../src/regions.js';
import { calculateHeatIndex } from '../src/heatwave.js';

// Builds a daily series from `start` to `end` (inclusive) using valueFor(isoDate).
function series(start, end, valueFor) {
  const time = [];
  const tmax = [];
  for (let d = new Date(`${start}T00:00:00Z`); d <= new Date(`${end}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    time.push(iso);
    tmax.push(valueFor(iso));
  }
  return { time, tmax };
}

test('buildAnalytics reports the anomaly against the previous years', () => {
  // 30°C in every year before 2026, 33°C in 2026: every day should be +3°C.
  const archive = series('2016-01-01', '2026-09-30', (iso) => (iso.startsWith('2026') ? 33 : 30));
  const result = buildAnalytics(archive);

  assert.equal(result.series.length, 30);
  assert.equal(result.series.at(-1).date, '2026-09-30');
  assert.equal(result.baselinePeriod, '2016–2025');
  assert.ok(result.series.every((p) => p.baseline === 30 && p.anomaly === 3));
  assert.equal(result.summary.meanAnomaly, 3);
  assert.equal(result.summary.daysAboveBaseline, 30);
});

test('buildAnalytics leaves gaps as null instead of inventing values', () => {
  const archive = series('2016-01-01', '2026-09-30', () => 30);
  archive.tmax[archive.tmax.length - 1] = null;
  const result = buildAnalytics(archive);

  assert.equal(result.series.at(-1).observed, null);
  assert.equal(result.series.at(-1).anomaly, null);
  assert.equal(result.summary.daysCompared, 29);
});

test('buildExposure counts hot days per complete year and for the current year', () => {
  const archive = series('2016-01-01', '2026-09-30', (iso) => {
    if (iso.endsWith('-05-10') || iso.endsWith('-05-11')) return 41; // 2 days >= 40
    if (iso.endsWith('-06-01')) return 46; // 1 day >= 45 (and >= 40)
    return 30;
  });
  const result = buildExposure(archive);

  assert.equal(result.yearsAnalysed, 10);
  assert.equal(result.avgDaysAbove40, 3);
  assert.equal(result.avgDaysAbove45, 1);
  assert.equal(result.currentYear.year, 2026);
  assert.equal(result.currentYear.daysAbove40, 3);
  assert.deepEqual(result.hottestDay, { date: '2016-06-01', temp: 46 });
});

test('summarizeRegion never invents readings when the weather API is down', () => {
  const fresh = summarizeRegion({ name: 'Delhi NCR', latitude: 28.6, longitude: 77.2 }, null, null);
  assert.equal(fresh.live, false);
  assert.equal(fresh.temperature, undefined);
  assert.equal(fresh.riskLevel, undefined);

  const stale = summarizeRegion({ name: 'Jaipur', temperature: 41, heatIndex: 45, riskLevel: 'Moderate' }, null, null);
  assert.equal(stale.live, false);
  assert.equal(stale.temperature, 41);
  assert.match(stale.summary, /last known/);
});

test('summarizeRegion builds a live record from Open-Meteo data', () => {
  const region = summarizeRegion(
    { name: 'Nagpur', query: 'Nagpur', latitude: 21.1458, longitude: 79.0882 },
    {
      current: { time: '2026-05-01T14:00', temperature_2m: 44, relative_humidity_2m: 30, apparent_temperature: 45.2 },
      daily: { uv_index_max: [10.4] },
      timezone_abbreviation: 'GMT+5:30'
    },
    { date: '2026-04-28', t2mMax: 43.1 }
  );

  assert.equal(region.live, true);
  assert.equal(region.heatIndex, calculateHeatIndex(44, 30));
  assert.equal(region.uvIndexMax, 10.4);
  assert.equal(region.nasaPower.t2mMax, 43.1);
});

test('calculateHeatIndex stays close to the air temperature in mild weather', () => {
  const hi = calculateHeatIndex(15, 60);
  assert.ok(Math.abs(hi - 15) < 2, `expected about 15, got ${hi}`);
});
