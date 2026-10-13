import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAdvisories, buildNotifications, calculateHeatIndex, getRiskLevel } from '../src/heatwave.js';

test('calculateHeatIndex returns a higher value for hotter and more humid conditions', () => {
  const mild = calculateHeatIndex(30, 40);
  const severe = calculateHeatIndex(44, 55);

  assert.ok(severe > mild);
});

test('getRiskLevel maps heat index to the expected risk band', () => {
  assert.equal(getRiskLevel(39), 'Low');
  assert.equal(getRiskLevel(42), 'Moderate');
  assert.equal(getRiskLevel(47), 'High');
  assert.equal(getRiskLevel(51), 'Severe');
});

test('buildAdvisories adds an escalation advisory for high-risk regions', () => {
  const advisories = buildAdvisories({ name: 'Delhi NCR', riskLevel: 'High' });

  assert.equal(advisories.length, 3);
  assert.match(advisories[2], /escalation/i);
});

test('buildNotifications only returns alerts for high-risk regions', () => {
  const notifications = buildNotifications([
    { name: 'Delhi NCR', riskLevel: 'Severe', heatIndex: 52 },
    { name: 'Nagpur', riskLevel: 'Moderate', heatIndex: 44 },
    { name: 'Jaipur', riskLevel: 'High', heatIndex: 48 }
  ]);

  assert.equal(notifications.length, 2);
  assert.equal(notifications[0].severity, 'Critical');
  assert.equal(notifications[1].severity, 'High');
});

test('calculateHeatIndex handles null/NaN/invalid parameters gracefully', () => {
  const defaultVal = calculateHeatIndex(NaN, null);
  const baseline = calculateHeatIndex(35, 40); // defaults to 35 and 40

  assert.equal(defaultVal, baseline);
});

test('getRiskLevel handles null/NaN/invalid parameters gracefully', () => {
  assert.equal(getRiskLevel(NaN), 'Low');
  assert.equal(getRiskLevel(null), 'Low');
});

