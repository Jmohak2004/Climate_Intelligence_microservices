import { useEffect, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

async function getJson(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    throw new Error(`${path} returned ${res.status}`);
  }
  return res.json();
}

function LoadError({ what, message }) {
  return <p className="panel-note">Could not load {what} ({message}). Please try again shortly.</p>;
}

function formatDay(isoDate) {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

// Same bands as the backend's getRiskLevel, so the forecast table matches the dashboard.
function riskLabel(heatIndex) {
  if (heatIndex >= 50) return 'Severe';
  if (heatIndex >= 46) return 'High';
  if (heatIndex >= 41) return 'Moderate';
  return 'Low';
}

// Loads the monitored regions so location-based pages can query real coordinates.
function useRegions() {
  const [regions, setRegions] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState('');

  useEffect(() => {
    getJson('/api/regions')
      .then((d) => {
        const list = Array.isArray(d) ? d.filter((r) => Number.isFinite(r.latitude) && Number.isFinite(r.longitude)) : [];
        setRegions(list);
        setSelected(list[0]?.name ?? '');
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const region = regions.find((r) => r.name === selected) ?? regions[0] ?? null;
  const query = region ? `?latitude=${region.latitude}&longitude=${region.longitude}` : '';
  return { regions, loaded, region, query, select: setSelected };
}

function RegionPicker({ regions, region, onSelect }) {
  if (regions.length < 2) return null;
  return (
    <label className="region-picker">
      <span className="panel-note">Location</span>
      <select value={region?.name ?? ''} onChange={(e) => onSelect(e.target.value)}>
        {regions.map((r) => (
          <option key={r.name} value={r.name}>{r.name}</option>
        ))}
      </select>
    </label>
  );
}

// Fetches `/api/<path><query>` once regions are known and again when the location changes.
function useLocationData(path, { loaded, query }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!loaded) return;
    setLoading(true);
    setError('');
    getJson(`${path}${query}`)
      .then(setData)
      .catch((e) => {
        setData(null);
        setError(e.message);
      })
      .finally(() => setLoading(false));
  }, [path, loaded, query]);

  return { data, loading, error };
}

export function ForecastPage() {
  const regionState = useRegions();
  const { regions, region, select } = regionState;
  const { data, loading, error } = useLocationData('/api/forecast', regionState);

  if (loading) return <div className="loading-orb-container"><div className="loading-orb" /><p>Loading live forecast...</p></div>;

  return (
    <div className="page-shell">
      <header className="page-header">
        <span className="eyebrow">Live Forecast</span>
        <h1>7-Day Heatwave Forecast & Hourly Thermal Trends</h1>
        <p>
          Forecast temperature and humidity from Open-Meteo, converted to a heat index with the NWS Rothfusz regression.
          Daily values pair the day's maximum temperature with its lowest (afternoon) humidity.
        </p>
        <RegionPicker regions={regions} region={region} onSelect={select} />
      </header>
      {error ? <LoadError what="the forecast" message={error} /> : null}

      <section className="panel section-panel">
        <h2>Hourly Thermal Index & Stress Forecast (Today)</h2>
        <div className="trend-grid">
          {data?.hourlyTrend?.map((item) => (
            <div className="trend-card" key={item.time}>
              <span className="trend-time">{item.time}</span>
              <strong className="trend-temp">{item.temp}°C</strong>
              <div className="trend-bar-wrap">
                <div className="trend-bar" style={{ width: `${Math.min(100, item.heatIndex * 1.8)}%` }} />
              </div>
              <span className="trend-detail">Heat Index: {item.heatIndex}°C</span>
              <span className="trend-uv">UV Index: {item.uv ?? '--'}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel section-panel">
        <h2>7-Day Heatwave Projections{region ? ` for ${region.name}` : ''}</h2>
        <div className="forecast-table-wrap">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Day</th>
                <th>Max Temp</th>
                <th>Min Temp</th>
                <th>Lowest Humidity</th>
                <th>Peak UV</th>
                <th>Heat Index</th>
                <th>Risk Classification</th>
              </tr>
            </thead>
            <tbody>
              {data?.sevenDayForecast?.map((row) => {
                const risk = riskLabel(row.heatIndex);
                return (
                  <tr key={row.date}>
                    <td><strong>{row.day}</strong> <span className="panel-note">{formatDay(row.date)}</span></td>
                    <td>{row.maxTemp}°C</td>
                    <td>{row.minTemp}°C</td>
                    <td>{row.humidityMin}%</td>
                    <td>{row.uvMax ?? '--'}</td>
                    <td><strong className="accent-text">{row.heatIndex}°C</strong></td>
                    <td><span className={`pill pill-${risk.toLowerCase()}`}>{risk}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export function ExposurePage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getJson('/api/exposure').then(setData).catch((e) => setError(e.message));
  }, []);

  const rows = data?.regions ?? [];
  const maxDays = Math.max(1, ...rows.map((r) => r.avgDaysAbove40 ?? 0));

  return (
    <div className="page-shell">
      <header className="page-header">
        <span className="eyebrow">Heat Exposure</span>
        <h1>Regional Heat Exposure Ranking</h1>
        <p>
          How often each monitored region reaches 40°C and 45°C, the daily maximum temperatures at which India's heat-wave
          criteria begin, measured over the last ten years of ERA5 reanalysis data from Open-Meteo.
        </p>
      </header>
      {error ? <LoadError what="exposure data" message={error} /> : null}
      {!data && !error ? <div className="loading-orb-container"><div className="loading-orb" /><p>Analysing 10 years of climate data...</p></div> : null}

      {data ? (
        <section className="panel section-panel">
          <h2>Monitored Regions, Hottest First</h2>
          <div className="district-grid">
            {rows.map((r, index) => (
              <article className="district-card" key={r.name}>
                <div className="district-header">
                  <div>
                    <strong>#{index + 1} {r.name}</strong>
                    <span className="district-sub">
                      Hottest day on record: {r.hottestDay?.temp}°C ({formatDay(r.hottestDay?.date)} {r.hottestDay?.date?.slice(0, 4)})
                    </span>
                  </div>
                </div>
                <div className="vulnerability-bar-wrap">
                  <div className="vulnerability-label">
                    <span>Avg. days ≥ 40°C per year</span>
                    <strong>{r.avgDaysAbove40}</strong>
                  </div>
                  <div className="bar-bg">
                    <div className="bar-fill" style={{ width: `${((r.avgDaysAbove40 ?? 0) / maxDays) * 100}%` }} />
                  </div>
                </div>
                <div className="district-meta">
                  <span>Avg. days ≥ 45°C per year: <strong>{r.avgDaysAbove45}</strong></span>
                  <span>
                    {r.currentYear.year} so far: <strong>{r.currentYear.daysAbove40}</strong> days ≥ 40°C, <strong>{r.currentYear.daysAbove45}</strong> ≥ 45°C
                  </span>
                </div>
              </article>
            ))}
          </div>
          {data.unavailable?.length ? <p className="panel-note">No data this time for: {data.unavailable.join(', ')}.</p> : null}
          <p className="panel-note">
            Source: {data.source}, {data.period}. Yearly averages use complete calendar years only. Reanalysis grid cells are
            about 25 km wide, so values are regional rather than weather-station readings.
          </p>
        </section>
      ) : null}
    </div>
  );
}

export function AdvisoriesPage() {
  const [advisories, setAdvisories] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    getJson('/api/health-advisories')
      .then((d) => setAdvisories(Array.isArray(d) ? d : []))
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="page-shell">
      <header className="page-header">
        <span className="eyebrow">Public Safety Protocols</span>
        <h1>Heat Risk Health & Safety Advisories</h1>
        <p>General guidelines for citizens, health responders, and municipal workers.</p>
      </header>
      {error ? <LoadError what="advisories" message={error} /> : null}

      <div className="advisory-cards-stack">
        {advisories.map((adv) => (
          <article className="panel advisory-block" key={adv.id}>
            <div className="advisory-block-header">
              <div>
                <span className="eyebrow">{adv.category}</span>
                <h2>{adv.title}</h2>
                <span className="panel-note">Target: {adv.targetAudience}</span>
              </div>
              <span className={`pill pill-${adv.severity.toLowerCase()}`}>{adv.severity}</span>
            </div>
            <p className="advisory-desc">{adv.content}</p>

            <div className="do-dont-grid">
              <div className="do-box">
                <h3>Do's</h3>
                <ul>
                  {adv.doList?.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="dont-box">
                <h3>Don'ts</h3>
                <ul>
                  {adv.dontList?.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

export function ResourcesPage() {
  const [resources, setResources] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    getJson('/api/resources')
      .then((d) => setResources(Array.isArray(d) ? d : []))
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="page-shell">
      <header className="page-header">
        <span className="eyebrow">Field Logistics</span>
        <h1>Cooling Centers & Relief Directory</h1>
        <p>
          Occupancy tracking for community cooling centers and hydration shelters. Entries marked "Sample" are placeholders
          until operators register real centers through the API. In an emergency, call 112 (or 108 for an ambulance).
        </p>
      </header>
      {error ? <LoadError what="cooling centers" message={error} /> : null}

      <div className="resource-grid">
        {resources.map((r) => (
          <article className="panel resource-card" key={r.id}>
            <div className="resource-header">
              <span className="eyebrow">{r.type}</span>
              <span className="status-badge status-active">{r.sample ? `Sample · ${r.status}` : r.status}</span>
            </div>
            <h2>{r.name}</h2>
            <p className="resource-address">{r.address}</p>

            <div className="occupancy-wrap">
              <div className="occupancy-label">
                <span>Occupancy</span>
                <strong>{r.currentOccupancy} / {r.capacity} Seats</strong>
              </div>
              <div className="bar-bg">
                <div className="bar-fill" style={{ width: `${Math.min(100, (r.currentOccupancy / r.capacity) * 100)}%` }} />
              </div>
            </div>

            <div className="resource-footer">
              <span>Emergency: <strong>{r.contacts}</strong></span>
              <a
                className="secondary-action btn-sm"
                title={`Get directions to ${r.name} cooling center`}
                href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(r.address)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Get Directions
              </a>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function TrendChart({ series }) {
  const W = 640;
  const H = 260;
  const pad = { left: 40, right: 12, top: 12, bottom: 28 };
  const values = series.flatMap((p) => [p.observed, p.baseline]).filter((v) => v !== null);
  if (!values.length) return null;

  const lo = Math.floor(Math.min(...values)) - 1;
  const hi = Math.ceil(Math.max(...values)) + 1;
  const x = (i) => pad.left + (i / (series.length - 1)) * (W - pad.left - pad.right);
  const y = (v) => pad.top + (1 - (v - lo) / (hi - lo)) * (H - pad.top - pad.bottom);

  // Break the line wherever a value is missing instead of bridging the gap.
  const line = (key) =>
    series
      .map((p, i) => (p[key] === null ? null : `${series[i - 1]?.[key] == null ? 'M' : 'L'}${x(i)},${y(p[key])}`))
      .filter(Boolean)
      .join(' ');

  const ticks = Array.from({ length: 5 }, (_, i) => lo + ((hi - lo) * i) / 4);
  const labelIndexes = [0, Math.floor((series.length - 1) / 2), series.length - 1];

  return (
    <svg className="trend-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Daily maximum temperature against the ten-year baseline">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.left} x2={W - pad.right} y1={y(t)} y2={y(t)} stroke="rgba(255,255,255,0.08)" />
          <text x={pad.left - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="rgba(255,255,255,0.6)">{Math.round(t)}°</text>
        </g>
      ))}
      <path d={line('baseline')} fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="2" strokeDasharray="5 4" />
      <path d={line('observed')} fill="none" stroke="#ff7256" strokeWidth="2.5" />
      {series.map((p, i) =>
        p.observed === null ? null : (
          <circle key={p.date} cx={x(i)} cy={y(p.observed)} r="3.5" fill="#ff7256">
            <title>{`${formatDay(p.date)}: ${p.observed}°C observed, ${p.baseline ?? '--'}°C baseline`}</title>
          </circle>
        )
      )}
      {labelIndexes.map((i) => (
        <text
          key={i}
          x={x(i)}
          y={H - 8}
          textAnchor={i === 0 ? 'start' : i === series.length - 1 ? 'end' : 'middle'}
          fontSize="11"
          fill="rgba(255,255,255,0.6)"
        >
          {formatDay(series[i].date)}
        </text>
      ))}
    </svg>
  );
}

export function AnalyticsPage() {
  const regionState = useRegions();
  const { regions, region, select } = regionState;
  const { data, loading, error } = useLocationData('/api/analytics', regionState);
  const summary = data?.summary;

  return (
    <div className="page-shell">
      <header className="page-header">
        <span className="eyebrow">Climate Intelligence</span>
        <h1>Temperature Anomaly Analysis</h1>
        <p>The last 30 days of observed daily maximum temperature compared with the same dates over the previous ten years.</p>
        <RegionPicker regions={regions} region={region} onSelect={select} />
      </header>
      {error ? <LoadError what="historical climate data" message={error} /> : null}
      {loading ? <div className="loading-orb-container"><div className="loading-orb" /><p>Loading historical climate data...</p></div> : null}

      {data && !loading ? (
        <div className="dashboard-grid">
          <div className="main-column">
            <section className="panel">
              <h2>30-Day Maximum Temperature vs Ten-Year Baseline{region ? `: ${region.name}` : ''}</h2>
              <p className="panel-note">
                {formatDay(data.period.start)} to {formatDay(data.period.end)} {data.period.end.slice(0, 4)}. Baseline is the mean of the
                same dates (±3 days) in {data.baselinePeriod}.
              </p>
              <div className="chart-placeholder">
                <TrendChart series={data.series} />
                <div className="chart-legend">
                  <span><i className="legend-dot actual-dot" /> Observed daily maximum (°C)</span>
                  <span><i className="legend-dot baseline-dot" /> {data.baselinePeriod} mean (°C)</span>
                </div>
              </div>
            </section>
          </div>

          <aside className="side-column">
            <section className="panel">
              <h2>Summary</h2>
              <ul className="advisory-list">
                <li>
                  Average anomaly: <strong>{summary.meanAnomaly > 0 ? '+' : ''}{summary.meanAnomaly}°C</strong>
                </li>
                <li>
                  Warmer than baseline on <strong>{summary.daysAboveBaseline} of {summary.daysCompared}</strong> days
                </li>
                {summary.hottestDay ? (
                  <li>
                    Hottest day: <strong>{summary.hottestDay.temp}°C</strong> on {formatDay(summary.hottestDay.date)}
                  </li>
                ) : null}
              </ul>
            </section>
            <section className="panel">
              <h2>Data Sources & Methodology</h2>
              <ul className="advisory-list">
                <li><strong>Open-Meteo Historical Weather API</strong>: ERA5 reanalysis daily maximum 2 m temperature, 2016 onward. The latest days trail real time by about five days.</li>
                <li><strong>Open-Meteo Forecast API</strong>: live temperature, humidity and forecasts used on the Live Monitor and Forecast pages.</li>
                <li><strong>NASA POWER</strong>: latest available daily maximum temperature, shown on the Live Monitor.</li>
                <li><strong>Heat index</strong>: NWS Rothfusz regression (Steadman formula below 26.7°C).</li>
              </ul>
            </section>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
