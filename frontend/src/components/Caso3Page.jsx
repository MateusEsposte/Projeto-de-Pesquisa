import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, BarChart, Bar } from 'recharts';
import './productionloss.css';

const PlatformProductionAnalysis = ({ ontologyData, apiBase = 'http://localhost:8000' }) => {
  const navigate = useNavigate();
  const location = useLocation();

  // Ontology management
  const effectiveOntology = ontologyData || location.state?.ontologyData || null;
  const [localOntology, setLocalOntology] = useState(effectiveOntology || null);

  // State management
  const [platforms, setPlatforms] = useState([]);
  const [selectedPlatform, setSelectedPlatform] = useState('');
  const [manualIdentifier, setManualIdentifier] = useState('');
  const [loading, setLoading] = useState(false);
  const [timeseriesLoading, setTimeseriesLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [productionData, setProductionData] = useState([]);
  const [message, setMessage] = useState('');
  const [selectedTag, setSelectedTag] = useState(null);

  // Advanced options
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [measurementClass, setMeasurementClass] = useState('o3po:flow_rate');
  const [procCharPred, setProcCharPred] = useState('core:processCharacteristicOf');
  const [tagPred, setTagPred] = useState('core:isAbout');

  // Helper function
  const localNameFromIri = (iri) => {
    try {
      if (!iri) return '';
      const s = String(iri);
      if (s.includes('#')) return s.split('#').pop();
      return s.split('/').pop();
    } catch (e) { return String(iri); }
  };

  const getSelectedPlatformDisplay = () => {
  if (manualIdentifier && manualIdentifier.trim()) {
    return manualIdentifier.trim();
  }
  if (selectedPlatform) {
    return localNameFromIri(selectedPlatform);
  }
  return 'SELECTED_PLATFORM';
};

  // Navigation handler
  const handleNavigation = (path) => {
    const ontToSend = localOntology || effectiveOntology || null;
    navigate(path, { state: { ontologyData: ontToSend } });
  };

  // Sync local ontology when props/location change
  useEffect(() => {
    if (effectiveOntology) {
      setLocalOntology(effectiveOntology);
    }
  }, [effectiveOntology]);

  // Fallback: fetch ontology from backend
  useEffect(() => {
    const fetchCurrent = async () => {
      if (localOntology) return;
      try {
        setLoading(true);
        const res = await axios.get(`${apiBase}/api/current-ontology/`);
        const ont = res.data?.ontology || res.data || null;
        if (ont) {
          setLocalOntology(ont);
          setMessage('Ontology loaded from server.');
        } else {
          setMessage('No active ontology found on server.');
        }
      } catch (err) {
        setMessage('Failed to fetch current ontology from server.');
      } finally {
        setLoading(false);
      }
    };

    fetchCurrent();
  }, []);

  // Populate platforms when ontology changes
  useEffect(() => {
    if (!localOntology || !Array.isArray(localOntology.individuals)) {
      setPlatforms([]);
      return;
    }

    // Filter FPSO platforms
    const fpsos = localOntology.individuals
      .filter(ind => {
        const types = ind.type || [];
        if (typeof types === 'string') return /FPSO|platform|plataforma/i.test(types);
        if (Array.isArray(types)) return types.some(t => /FPSO|platform|plataforma/i.test(t));
        return false;
      })
      .map(ind => ({
        value: ind.iri || ind.name || '',
        label: ind.name || (Array.isArray(ind.label) ? ind.label[0] : ind.label) || 'Unnamed'
      }))
      .sort((a, b) => a.label.localeCompare(b.label));

    setPlatforms(fpsos);
    if (fpsos.length > 0 && !selectedPlatform) {
      setSelectedPlatform(fpsos[0].value);
    }
  }, [localOntology]);

  // Execute platform production query
  const fetchProduction = async () => {
    const id = selectedPlatform || (manualIdentifier && manualIdentifier.trim()) || null;
    if (!id) {
      setMessage('Select a platform or enter identifier manually.');
      return;
    }

    setLoading(true);
    setMessage('Fetching platform production data...');
    setResults([]);
    setProductionData([]);

    try {
      const payload = {
        identifier: id,
        measurement_class: measurementClass,
        quality_predicate: undefined,
        component_predicate: undefined,
        tag_predicate: tagPred,
      };

      const endpoint = `${apiBase.replace(/\/$/, '')}/api/predefined-sparql/use_case_3/`;
      const res = await axios.post(endpoint, payload, { timeout: 30000 });
      const data = res.data || {};

      if (!data || data.status !== 'success') {
        setMessage(`Error: ${data.message || 'Invalid server response'}`);
        setResults([]);
        return;
      }

      let rows = data.results || [];
      if (!Array.isArray(rows)) rows = [];

      const mapped = rows.map(r => ({
        tagIri: r.tag_iri || '',
        tagName: r.tag_name || localNameFromIri(r.tag_iri || ''),
        flowIri: r.flow_iri || '',
        flowName: r.flow_name || localNameFromIri(r.flow_iri || ''),
        processIri: r.process_iri || '',
        processName: r.process_name || localNameFromIri(r.process_iri || ''),
        wellIri: r.well_iri || '',
        wellName: r.well_name || localNameFromIri(r.well_iri || ''),
        raw: r
      }));

      setResults(mapped);
      setMessage(`Found ${mapped.length} production items.`);

    } catch (err) {
      console.error(err);
      setMessage(`Error querying backend: ${err.message || err}`);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  // Fetch production timeseries for a specific tag
  const fetchProductionTimeseries = async (tagId) => {
    setSelectedTag(tagId);
    setTimeseriesLoading(true);
    setMessage(`Loading production data for ${localNameFromIri(tagId)}...`);

    try {
      const resp = await axios.get(`${apiBase}/api/timeseries/`, { params: { tag: tagId } });
      const data = resp.data;

      let chartData = [];
      if (Array.isArray(data)) {
        chartData = data.map(d => ({ t: d.timestamp || d.time || d.t, v: d.value ?? d.val ?? d.v }));
      } else if (data.timestamps && Array.isArray(data.timestamps) && Array.isArray(data.values)) {
        chartData = data.timestamps.map((t, i) => ({ t, v: data.values[i] }));
      } else if (Array.isArray(data.data)) {
        chartData = data.data.map(d => ({ t: d.timestamp || d.time || d.t, v: d.value ?? d.val ?? d.v }));
      }

      setProductionData(chartData);
      setMessage(`Production data loaded (${chartData.length} points)`);
    } catch (e) {
      console.error(e);
      setMessage('Could not load production data');
      setProductionData([]);
    } finally {
      setTimeseriesLoading(false);
    }
  };

  // Auto-execute query when platform changes
  useEffect(() => {
    if (selectedPlatform) {
      fetchProduction();
    }
  }, [selectedPlatform]);

  // Copy IRI to clipboard
  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setMessage('IRI copied to clipboard');
      setTimeout(() => setMessage(''), 2000);
    } catch (e) {
      setMessage('Failed to copy (check browser permissions).');
    }
  };

  // Calculate total production (mock calculation for display)
  const totalProduction = results.length > 0 ? results.length * 150 : 0; // Example calculation
  const avgFlowRate = productionData.length > 0 ? 
    (productionData.reduce((sum, item) => sum + item.v, 0) / productionData.length).toFixed(2) : 0;

  // Prepare chart data
  const chartData = productionData.map(item => ({
    time: new Date(item.t).toLocaleTimeString(),
    value: item.v
  }));

  return (
    <div className="production-loss-container">
      <div className="header">
        <h1>Platform Production Analysis</h1>
        <p className="subtitle">Monitoring of flow rates and total production by FPSO platform</p>
      </div>
      
      <div className="container">
        <div className="sidebar">
          <div className="section-title">Platform Selection</div>
          <div className="well-selector">
            <select 
              value={selectedPlatform} 
              onChange={(e) => setSelectedPlatform(e.target.value)}
              disabled={loading}
            >
              <option value="">-- Select platform --</option>
              {platforms.map(platform => (
                <option key={platform.value} value={platform.value}>{platform.label}</option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', color: '#718096' }}>
              Manual Identifier:
            </label>
            <input
              type="text"
              value={manualIdentifier}
              onChange={(e) => setManualIdentifier(e.target.value)}
              placeholder="FPSO_Espirito_Santos"
              style={{
                width: '100%',
                padding: '8px',
                border: '2px solid #e2e8f0',
                borderRadius: '6px',
                fontSize: '12px'
              }}
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <button 
              className="btn btn-primary" 
              onClick={fetchProduction} 
              disabled={loading}
              style={{ width: '100%' }}
            >
              {loading ? 'Fetching...' : 'Fetch Production'}
            </button>
          </div>

          <div style={{ marginBottom: '10px' }}>
            <button 
              className="btn btn-secondary btn-sm" 
              onClick={() => setAdvancedOpen(s => !s)}
              style={{ width: '100%' }}
            >
              {advancedOpen ? 'Close Advanced' : 'Advanced Options'}
            </button>
          </div>

          {advancedOpen && (
            <div style={{ 
              marginBottom: '20px', 
              padding: '12px', 
              background: '#f7fafc', 
              borderRadius: '8px',
              border: '1px solid #e2e8f0'
            }}>
              <div style={{ marginBottom: '8px' }}>
                <label style={{ fontSize: '11px', color: '#718096' }}>Measurement Class:</label>
                <input
                  style={{ width: '100%', padding: '4px', fontSize: '11px', marginTop: '2px' }}
                  value={measurementClass}
                  onChange={e => setMeasurementClass(e.target.value)}
                />
              </div>
              <div style={{ marginBottom: '8px' }}>
                <label style={{ fontSize: '11px', color: '#718096' }}>Process Char Predicate:</label>
                <input
                  style={{ width: '100%', padding: '4px', fontSize: '11px', marginTop: '2px' }}
                  value={procCharPred}
                  onChange={e => setProcCharPred(e.target.value)}
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: '#718096' }}>Tag Predicate:</label>
                <input
                  style={{ width: '100%', padding: '4px', fontSize: '11px', marginTop: '2px' }}
                  value={tagPred}
                  onChange={e => setTagPred(e.target.value)}
                />
              </div>
            </div>
          )}
          
          <div className="section-title">Production Tags</div>
          <div className="icv-list">
            {results.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#718096' }}>
                <div>No tags found</div>
                <div style={{ fontSize: '0.8rem' }}>Run a search to see results</div>
              </div>
            ) : (
              results.map((result, index) => (
                <div key={result.tagIri || index} className="icv-item">
                  <input 
                    type="radio" 
                    className="icv-checkbox" 
                    name="selectedProductionTag"
                    checked={selectedTag === result.tagIri}
                    onChange={() => fetchProductionTimeseries(result.tagIri)}
                  />
                  <div className="icv-info">
                    <div className="icv-name">{result.tagName}</div>
                    <div className="icv-status">
                      <span className="status-indicator status-ok"></span>
                      Well: {result.wellName}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
          
          <div className="section-title">Information</div>
          <div className="analysis-panel">
            <div className="analysis-title">Platform Status</div>
            <div className="analysis-item">
              <span>Platforms</span>
              <span>{platforms.length}</span>
            </div>
            <div className="analysis-item">
              <span>Production Tags</span>
              <span>{results.length}</span>
            </div>
            <div className="analysis-item">
              <span>Total Production</span>
              <span>{totalProduction} bbl/d</span>
            </div>
            <div className="analysis-item">
              <span>Average Flow Rate</span>
              <span>{avgFlowRate} bbl/d</span>
            </div>
          </div>
        </div>
        
        <div className="main-content">
          <div className="query-section">
            <div className="section-title">Production DL Query</div>
            <div className="query-input">
              <textarea 
                id="queryText" 
                readOnly 
                value={`'is about' some ('flow rate' and 'process characteristic of' some ('production process' and 'component of' value ${getSelectedPlatformDisplay()}))`} 
              />
            </div>
            <button 
              className="btn btn-primary" 
              onClick={fetchProduction} 
              disabled={loading || (!selectedPlatform && !manualIdentifier)}
            >
              {loading ? 'Running...' : 'Run Query'}
            </button>
            
            <div className="query-results">
              <strong>Results ({results.length}):</strong><br />
              {results.map((result, index) => (
                <div key={result.tagIri || index}>
                  ◆ {result.tagName}
                  <button 
                    style={{ 
                      marginLeft: '10px', 
                      padding: '2px 6px', 
                      fontSize: '10px',
                      background: '#e2e8f0',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                    onClick={() => copyToClipboard(result.tagIri)}
                  >
                    Copy IRI
                  </button>
                </div>
              ))}
            </div>
            
            {message && (
              <div className="alert alert-info">
                <strong>Info:</strong> {message}
              </div>
            )}
          </div>
          
          <div className="visualization-area">
            <div className="section-title">Visualization - Platform Production</div>
            
            <div className="metrics-grid">
              <div className="metric-card">
                <div className="metric-value">{platforms.length}</div>
                <div className="metric-label">Platforms</div>
              </div>
              <div className="metric-card">
                <div className="metric-value">{results.length}</div>
                <div className="metric-label">Production Wells</div>
              </div>
              <div className="metric-card">
                <div className="metric-value">{totalProduction}</div>
                <div className="metric-label">Total Production (bbl/d)</div>
              </div>
              <div className="metric-card">
                <div className="metric-value">{productionData.length}</div>
                <div className="metric-label">Time Points</div>
              </div>
            </div>
            
            <div className="chart-container">
              {timeseriesLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                  <div>Loading production data...</div>
                </div>
              ) : chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" />
                    <YAxis />
                    <Tooltip formatter={(value) => [`${value} bbl/d`, 'Flow Rate']} />
                    <Line 
                      type="monotone"
                      dataKey="value"
                      stroke="#48bb78"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'center', 
                  alignItems: 'center', 
                  height: '100%',
                  color: '#718096'
                }}>
                  <div>
                    <div style={{ fontSize: '2rem', opacity: 0.3, textAlign: 'center' }}></div>
                    <div>Select a production tag to view data</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlatformProductionAnalysis;