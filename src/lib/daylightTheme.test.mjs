import test from 'node:test';
import assert from 'node:assert/strict';
import { getTimes } from 'suncalc';
import { daylightTheme } from './daylightTheme.ts';

test('appearance changes at the local sunrise and sunset, not a fixed clock hour', () => {
  for (const [latitude, longitude] of [[34.05, -118.24], [40.42, -3.7], [-33.87, 151.21]]) {
    const { sunrise, sunset } = getTimes(new Date('2026-11-17T12:00:00Z'), latitude, longitude);
    assert.equal(daylightTheme(new Date(+sunrise - 120000), latitude, longitude), 'dark');
    assert.equal(daylightTheme(new Date(+sunrise + 120000), latitude, longitude), 'light');
    assert.equal(daylightTheme(new Date(+sunset - 120000), latitude, longitude), 'light');
    assert.equal(daylightTheme(new Date(+sunset + 120000), latitude, longitude), 'dark');
  }
});
test('polar day and night do not depend on invalid sunrise timestamps', () => {
  assert.equal(daylightTheme(new Date('2026-06-21T12:00:00Z'), 78.22, 15.65), 'light');
  assert.equal(daylightTheme(new Date('2026-12-21T12:00:00Z'), 78.22, 15.65), 'dark');
});
