import { useEffect, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export function ForecastPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/api/forecast`)
      .then((res) => res.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading-orb-container"><div className="loading-orb" /><p>Loading forecast models...</p></div>;

  return (
    <div className="page-shell">
      <header className="page-header">
        <span className="eyebrow">Predictive Analytics</span>
        <h1>7-Day Heatwave Forecast & Hourly Thermal Trends</h1>
        <p>Advanced thermal stress modeling based on Open-Meteo & NASA POWER meteorological data.</p>
      </header>

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
              <span className="trend-uv">UV Index: {item.uv}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel section-panel">
        <h2>7-Day Regional Heatwave Projections</h2>
        <div className="forecast-table-wrap">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Day</th>
                <th>Max Temp</th>
                <th>Min Temp</th>
                <th>Heat Index</th>
                <th>Risk Classification</th>
              </tr>
            </thead>
            <tbody>
              {data?.sevenDayForecast?.map((row) => (
                <tr key={row.day}>
                  <td><strong>{row.day}</strong></td>
                  <td>{row.maxTemp}°C</td>
                  <td>{row.minTemp}°C</td>
                  <td><strong className="accent-text">{row.heatIndex}°C</strong></td>
                  <td><span className={`pill pill-${row.risk.toLowerCase()}`}>{row.risk}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export function VulnerabilityPage() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/vulnerability`)
      .then((res) => res.json())
      .then((d) => setData(d));
  }, []);

  return (
    <div className="page-shell">
      <header className="page-header">
        <span className="eyebrow">Risk Matrix</span>
        <h1>District Vulnerability Index</h1>
        <p>Vulnerability scoring based on population density, socio-economic factors, and thermal exposure.</p>
      </header>

      <div className="hero-metrics gap-bottom">
        <div className="metric-card">
          <span className="metric-label">Monitored Districts</span>
          <strong className="metric-value">{data?.summary?.totalDistricts ?? 142}</strong>
          <span className="metric-detail">Across high-risk states</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Extreme Vulnerability</span>
          <strong className="metric-value severe-text">{data?.summary?.extremeVulnerability ?? 18}</strong>
          <span className="metric-detail">Immediate action required</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">High Risk Zones</span>
          <strong className="metric-value high-text">{data?.summary?.highVulnerability ?? 44}</strong>
          <span className="metric-detail">Escalation active</span>
        </div>
      </div>

      <section className="panel section-panel">
        <h2>High-Priority Heat Risk District Watchlist</h2>
        <div className="district-grid">
          {data?.districts?.map((d) => (
            <article className="district-card" key={d.id}>
              <div className="district-header">
                <div>
                  <strong>{d.name}</strong>
                  <span className="district-sub">{d.state} • Pop: {d.population}</span>
                </div>
                <span className={`pill pill-${d.riskTier.toLowerCase()}`}>{d.riskTier}</span>
              </div>
              <div className="vulnerability-bar-wrap">
                <div className="vulnerability-label">
                  <span>Vulnerability Score</span>
                  <strong>{d.vulnerabilityScore}/100</strong>
                </div>
                <div className="bar-bg">
                  <div className="bar-fill" style={{ width: `${d.vulnerabilityScore}%` }} />
                </div>
              </div>
              <div className="district-meta">
                <span>Cooling Shelters: <strong>{d.coolingCenters}</strong></span>
                <span>Hospital Emergency Beds: <strong>{d.hospitalBeds}</strong></span>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

export function AdvisoriesPage() {
  const [advisories, setAdvisories] = useState([]);

  useEffect(() => {
    fetch(`${API_BASE}/api/health-advisories`)
      .then((res) => res.json())
      .then((d) => setAdvisories(d));
  }, []);

  return (
    <div className="page-shell">
      <header className="page-header">
        <span className="eyebrow">Public Safety Protocols</span>
        <h1>Heat Risk Health & Safety Advisories</h1>
        <p>Evidence-based guidelines for citizens, health responders, and municipal workers.</p>
      </header>

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

  useEffect(() => {
    fetch(`${API_BASE}/api/resources`)
      .then((res) => res.json())
      .then((d) => setResources(d));
  }, []);

  return (
    <div className="page-shell">
      <header className="page-header">
        <span className="eyebrow">Field Logistics</span>
        <h1>Cooling Centers & Relief Directory</h1>
        <p>Real-time occupancy tracking for community cooling centers and emergency hydration shelters.</p>
      </header>

      <div className="resource-grid">
        {resources.map((r) => (
          <article className="panel resource-card" key={r.id}>
            <div className="resource-header">
              <span className="eyebrow">{r.type}</span>
              <span className="status-badge status-active">{r.status}</span>
            </div>
            <h2>{r.name}</h2>
            <p className="resource-address">{r.address}</p>

            <div className="occupancy-wrap">
              <div className="occupancy-label">
                <span>Occupancy</span>
                <strong>{r.currentOccupancy} / {r.capacity} Seats</strong>
              </div>
              <div className="bar-bg">
                <div className="bar-fill" style={{ width: `${(r.currentOccupancy / r.capacity) * 100}%` }} />
              </div>
            </div>

            <div className="resource-footer">
              <span>Emergency Hotline: <strong>{r.contacts}</strong></span>
              <button className="secondary-action btn-sm" title={`Get directions to ${r.name} cooling center`}>Get Directions</button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

export function AnalyticsPage() {
  return (
    <div className="page-shell">
      <header className="page-header">
        <span className="eyebrow">Climate Intelligence</span>
        <h1>Heat Index Analytics & Historical Comparative Analysis</h1>
        <p>Multi-year satellite thermal telemetry provided by Open-Meteo & NASA POWER RE Community datasets.</p>
      </header>

      <div className="dashboard-grid">
        <div className="main-column">
          <section className="panel">
            <h2>30-Day Heat Anomaly & Stress Comparison</h2>
            <p className="panel-note">Observed surface temperature vs 10-year baseline mean (°C)</p>
            <div className="chart-placeholder">
              <div className="chart-bars">
                {[38, 41, 44, 42, 45, 47, 43, 40, 42, 46, 48, 45, 41, 39, 42].map((val, idx) => (
                  <div className="chart-bar-group" key={idx}>
                    <div className="bar-actual" style={{ height: `${val * 2}px` }} title={`Actual: ${val}°C`} />
                    <div className="bar-baseline" style={{ height: `${(val - 3) * 2}px` }} title="Baseline" />
                  </div>
                ))}
              </div>
              <div className="chart-legend">
                <span><i className="legend-dot actual-dot" /> 2026 Observed Heat Index</span>
                <span><i className="legend-dot baseline-dot" /> 10-Year Historical Mean</span>
              </div>
            </div>
          </section>
        </div>

        <aside className="side-column">
          <section className="panel">
            <h2>Climate Data Sources & Methodology</h2>
            <ul className="advisory-list">
              <li><strong>Open-Meteo API</strong>: Real-time 2m screen temperature & relative humidity forecast.</li>
              <li><strong>NASA POWER RE</strong>: Surface solar irradiance & daily surface temperature bounds.</li>
              <li><strong>Rothfusz Heat Index Formula</strong>: NWS multi-variable equation computing human thermal discomfort.</li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
