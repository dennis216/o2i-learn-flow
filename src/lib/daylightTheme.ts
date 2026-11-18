import { getPosition } from 'suncalc';

export function daylightTheme(now: Date, latitude: number, longitude: number): 'light' | 'dark' {
  // Solar altitude also works through polar day/night, where rise/set times are invalid.
  return getPosition(now, latitude, longitude).altitude >= -0.833 * Math.PI / 180 ? 'light' : 'dark';
}
