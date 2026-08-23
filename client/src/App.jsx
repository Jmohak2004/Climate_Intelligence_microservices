import { useEffect, useState } from 'react';
import {
  ForecastPage,
  VulnerabilityPage,
  AdvisoriesPage,
  ResourcesPage,
  AnalyticsPage
} from './Pages.jsx';

function formatPercent(value) {
  return `${Math.round(value)}%`;
}

function SeverityPill({ level }) {
  return <span className={`pill pill-${level.toLowerCase()}`}>{level}</span>;
}

function AdvisoryList({ items = [] }) {
  if (!items || !items.length) {
    return <p className="panel-note">No active advisories for this region.</p>;
  }

  return (
    <ul className="advisory-list">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function RegionCard({ region, isActive, onSelect }) {
  return (
    <button className={`region-card ${isActive ? 'active' : ''}`} onClick={() => onSelect(region.name)}>
      <div className="region-card-top">
        <strong>{region.name}</strong>
        <SeverityPill level={region.riskLevel} />
      </div>
      <p>{region.summary}</p>
      <div className="region-card-meta">
        <span>{region.temperature}°C</span>
        <span>{region.humidity}% humidity</span>
      </div>
    </button>
  );
}

function MetricCard({ label, value, detail }) {
  return (
    <article className="metric-card">
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{value}</strong>
      <span className="metric-detail">{detail}</span>
    </article>
  );
}

function Navbar({ activeTab, onSelectTab }) {
  const tabs = [
    { id: 'dashboard', label: 'Live Monitor' },
    { id: 'forecast', label: 'Forecast & Trends' },
    { id: 'vulnerability', label: 'Risk Matrix' },
    { id: 'advisories', label: 'Advisories' },
    { id: 'resources', label: 'Cooling Centers' },
    { id: 'analytics', label: 'Analytics' }
  ];

  return (
    <header className="app-nav">
      <div className="nav-brand">
        <span className="brand-logo" role="img" aria-label="SuryaRakshak Logo" title="SuryaRakshak Dashboard" />
        <strong>SuryaRakshak</strong>
      </div>
      <nav className="nav-links">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`nav-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => onSelectTab(tab.id)}
            title={`View ${tab.label}`}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </header>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [dashboard, setDashboard] = useState(null);
  const [selectedRegion, setSelectedRegion] = useState('Delhi NCR');
  const [error, setError] = useState('');

  useEffect(() => {
    const titles = {
      dashboard: 'SuryaRakshak | Live Monitor',
      forecast: 'SuryaRakshak | Heatwave Forecast & Trends',
      vulnerability: 'SuryaRakshak | Risk Matrix',
      advisories: 'SuryaRakshak | Heat Advisories',
      resources: 'SuryaRakshak | Cooling Centers',
      analytics: 'SuryaRakshak | Climate Analytics'
    };
    document.title = titles[activeTab] || 'SuryaRakshak | Heatwave Surveillance & Climate Intelligence';
  }, [activeTab]);

  useEffect(() => {
    let active = true;

    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '';
    fetch(`${apiBaseUrl}/api/dashboard`)
      .then((response) => {
        if (!response.ok) {
          throw new Error('Failed to load dashboard data');
        }
        return response.json();
      })
      .then((data) => {
        if (active) {
          setDashboard(data);
          setSelectedRegion(data.regions[0]?.name ?? '');
        }
      })
      .catch((fetchError) => {
        if (active) {
          setError(fetchError.message);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const renderContent = () => {
    if (activeTab === 'forecast') return <ForecastPage />;
    if (activeTab === 'vulnerability') return <VulnerabilityPage />;
    if (activeTab === 'advisories') return <AdvisoriesPage />;
    if (activeTab === 'resources') return <ResourcesPage />;
    if (activeTab === 'analytics') return <AnalyticsPage />;

    if (error) {
      return (
        <main className="page-shell center-state">
          <h1>SuryaRakshak</h1>
          <p>{error}</p>
        </main>
      );
    }

    if (!dashboard) {
      return (
        <main className="page-shell center-state">
          <div className="loading-orb" />
          <p>Loading live heat-risk intelligence...</p>
        </main>
      );
    }

    const regionsList = dashboard?.regions ?? [];
    const currentRegion = regionsList.find((region) => region.name === selectedRegion) ?? regionsList[0] ?? {};
    const alertsList = dashboard?.alerts ?? [];

    return (
      <main className="page-shell">
        {dashboard.notifications?.length ? (
          <section className="panel push-panel">
            <div className="panel-header">
              <div>
                <span className="eyebrow">Page notifications</span>
                <h2>Live Heatwave Push Alerts</h2>
              </div>
              <span className="panel-note">Backend generated, no database</span>
            </div>
            <div className="alert-stack">
              {dashboard.notifications.map((notification) => (
                <article className="alert-card" key={notification.id}>
                  <SeverityPill level={notification.severity} />
                  <strong>{notification.title}</strong>
                  <p>{notification.message}</p>
                  <span>{notification.region}</span>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <section className="hero-panel">
          <div className="hero-copy">
            <span className="eyebrow">SuryaRakshak Climate Intelligence</span>
            <h1>Smart Heatwave Surveillance for Indian Regions</h1>
            <p>
              Track thermal stress, view district-level risk, and push clear advisories to field teams, health workers,
              and residents before heat becomes a crisis.
            </p>
            <div className="hero-actions">
              <button className="primary-action" title="View Live Heat Risk Advisories" onClick={() => setActiveTab('advisories')}>Live advisory feed</button>
              <button className="secondary-action" title="View Vulnerability Escalation Matrix" onClick={() => setActiveTab('vulnerability')}>Escalation matrix</button>
            </div>
          </div>

          <div className="hero-metrics">
            <MetricCard label="Active alerts" value={dashboard.summary?.activeAlerts ?? 0} detail="Across monitored regions" />
            <MetricCard label="High-risk districts" value={dashboard.summary?.highRiskDistricts ?? 0} detail="Requires intervention" />
            <MetricCard label="Average heat index" value={`${dashboard.summary?.averageHeatIndex ?? 0}°C`} detail="Regional mean" />
          </div>
        </section>

        <section className="dashboard-grid">
          <div className="main-column">
            <div className="panel region-panel">
              <div className="panel-header">
                <div>
                  <span className="eyebrow">Regional watch</span>
                  <h2>Monitored Heat Risk Locations</h2>
                </div>
                <span className="panel-note">Updated every 15 minutes</span>
              </div>
              <div className="region-list">
                {regionsList.map((region) => (
                  <RegionCard
                    key={region.name}
                    region={region}
                    isActive={region.name === currentRegion.name}
                    onSelect={setSelectedRegion}
                  />
                ))}
              </div>
            </div>

            <div className="panel detail-panel">
              <div className="panel-header">
                <div>
                  <span className="eyebrow">Selected region</span>
                  <h2>Heat Risk Data for {currentRegion.name || 'Select Region'}</h2>
                </div>
                {currentRegion.riskLevel ? <SeverityPill level={currentRegion.riskLevel} /> : null}
              </div>
              <div className="detail-grid">
                <MetricCard label="Temperature" value={`${currentRegion.temperature ?? '--'}°C`} detail="2m screen temperature" />
                <MetricCard label="Humidity" value={`${currentRegion.humidity ?? '--'}%`} detail="Relative humidity" />
                <MetricCard label="Heat index" value={`${currentRegion.heatIndex ?? '--'}°C`} detail="Computed exposure load" />
                <MetricCard label="Population at risk" value={currentRegion.populationAtRisk ?? 'N/A'} detail="Estimated vulnerable group" />
              </div>
              <p className="region-summary">{currentRegion.summary}</p>
            </div>
          </div>

          <aside className="side-column">
            <div className="panel advisory-panel">
              <div className="panel-header">
                <div>
                  <span className="eyebrow">Advisory</span>
                  <h2>Recommended Heat Risk Advisories</h2>
                </div>
              </div>
              <AdvisoryList items={currentRegion.advisories} />
            </div>

            {alertsList.length ? (
              <div className="panel alert-panel">
                <div className="panel-header">
                  <div>
                    <span className="eyebrow">Escalation</span>
                    <h2>Priority Thermal Stress Alerts</h2>
                  </div>
                </div>
                <div className="alert-stack">
                  {alertsList.map((alert) => (
                    <article className="alert-card" key={alert.id}>
                      <SeverityPill level={alert.severity} />
                      <strong>{alert.title}</strong>
                      <p>{alert.message}</p>
                      <span>{alert.region}</span>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}
          </aside>
        </section>
      </main>
    );
  };

  return (
    <div className="app-shell">
      <Navbar activeTab={activeTab} onSelectTab={setActiveTab} />
      {renderContent()}
    </div>
  );
}
