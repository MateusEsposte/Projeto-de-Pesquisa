import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import './productionloss.css';

const ReservoirConnectivityAnalysis = ({ ontologyData, apiBase = 'http://localhost:8000' }) => {
  const navigate = useNavigate();
  const location = useLocation();

  // Ontology management
  const effectiveOntology = ontologyData || location.state?.ontologyData || null;
  const [localOntology, setLocalOntology] = useState(effectiveOntology || null);

  // State management
  const [wells, setWells] = useState([]);
  const [selectedWell, setSelectedWell] = useState('');
  const [manualIdentifier, setManualIdentifier] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [message, setMessage] = useState('');
  const [dlQuery, setDlQuery] = useState('');

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

  // Populate wells when ontology changes
  useEffect(() => {
    if (!localOntology) {
      setWells([]);
      return;
    }

    const candidates = localOntology.individuals || [];
    
    // Extract well names from ontology individuals
    const wellNames = candidates
      .map(ind => {
        if (!ind) return null;
        if (typeof ind === 'string') return ind;
        return ind.name || ind.label || (ind['@id'] || null);
      })
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

    setWells(wellNames);
  }, [localOntology]);

  // Update DL Query when selected well changes
  useEffect(() => {
    const identifier = manualIdentifier || selectedWell;
    if (identifier) {
      setDlQuery(`'is about' some ('ICV annular pressure' and 'quality of' some ('inflow control valve' and 'component of' some (well and 'connected to' value ${identifier})))`);
    } else {
      setDlQuery(`'is about' some ('ICV annular pressure' and 'quality of' some ('inflow control valve' and 'component of' some (well and 'connected to' value SELECTED_WELL)))`);
    }
  }, [selectedWell, manualIdentifier]);

  // Execute connectivity analysis query
  const runConnectivityQuery = async () => {
    const identifier = manualIdentifier || selectedWell;
    if (!identifier) {
      setMessage('Select a well or enter identifier manually.');
      return;
    }

    setLoading(true);
    setMessage('Running connectivity analysis...');
    setResults([]);

    try {
      // Use the same endpoint and parameters as the working version
      const res = await axios.post(`${apiBase}/api/predefined-sparql/use_case_2/`, {
        identifier,
        id_type: 'label', // Match the working version
      });

      // Process response like the working version
      if (res.data && res.data.results) {
        setResults(res.data.results);
        setMessage(`Found ${res.data.results.length} connectivity measurements.`);
      } else {
        setMessage(res.data?.message || 'No connectivity detected.');
      }
    } catch (err) {
      console.error(err);
      const backendMsg = err.response?.data?.message || err.message || 'Unknown error';
      setMessage(`Error running analysis: ${backendMsg}`);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  // Reload ontology
  const handleReloadOntology = async () => {
    setMessage('');
    try {
      setLoading(true);
      const res = await axios.get(`${apiBase}/api/current-ontology/`);
      const ont = res.data?.ontology || res.data || null;
      if (ont) {
        setLocalOntology(ont);
        setMessage('Ontology reloaded from server.');
      } else {
        setMessage('No ontology found on server.');
      }
    } catch (err) {
      setMessage('Failed to reload ontology.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="production-loss-container">
      <div className="header">
        <h1>Reservoir Connectivity Analysis</h1>
        <p className="subtitle">Evaluation of injection wells impact on production well pressures</p>
      </div>
      
      <div className="container">
        <div className="sidebar">
          <div className="section-title">Well Selection</div>
          
          <div className="well-selector" style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', color: '#718096' }}>
              Select Well:
            </label>
            <select 
              value={selectedWell} 
              onChange={(e) => setSelectedWell(e.target.value)}
              disabled={loading}
            >
              <option value="">-- Select well --</option>
              {wells.map(well => (
                <option key={well} value={well}>{well}</option>
              ))}
            </select>
          </div>

          <div className="well-selector">
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', color: '#718096' }}>
              Manual Identifier:
            </label>
            <input
              type="text"
              value={manualIdentifier}
              onChange={(e) => setManualIdentifier(e.target.value)}
              placeholder="Well name or IRI..."
              style={{
                width: '100%',
                padding: '8px',
                border: '2px solid #e2e8f0',
                borderRadius: '6px',
                fontSize: '12px'
              }}
            />
          </div>
          
          <div className="section-title">Detected Measurements</div>
          <div className="icv-list">
            {results.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#718096' }}>
                <div>No measurements found</div>
                <div style={{ fontSize: '0.8rem' }}>Run an analysis to see results</div>
              </div>
            ) : (
              results.map((result, index) => (
                <div key={index} className="icv-item">
                  <div className="icv-info">
                    <div className="icv-name">{result.tag_name || result.file_name || 'Measurement ' + (index + 1)}</div>
                    <div className="icv-status">
                      <span className="status-indicator" style={{ backgroundColor: '#48bb78' }}></span>
                      {result.icv_name ? `ICV: ${result.icv_name}` : 'Connectivity detected'}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
          
          <div className="section-title"> Information</div>
          <div className="analysis-panel">
            <div className="analysis-title">Analysis Status</div>
            <div className="analysis-item">
              <span>Ontology</span>
              <span>{localOntology ? 'Loaded' : 'Not loaded'}</span>
            </div>
            <div className="analysis-item">
              <span>Available Wells</span>
              <span>{wells.length}</span>
            </div>
            <div className="analysis-item">
              <span>Measurements</span>
              <span>{results.length}</span>
            </div>
          </div>
        </div>
        
        <div className="main-content">
          <div className="query-section">
            <div className="section-title">Connectivity DL Query</div>
            <div className="query-input">
              <textarea 
                id="queryText" 
                readOnly 
                value={dlQuery}
                rows="4"
                style={{ fontFamily: 'monospace', fontSize: '14px' }}
              />
            </div>
            <button 
              className="btn btn-primary" 
              onClick={runConnectivityQuery} 
              disabled={loading || (!selectedWell && !manualIdentifier)}
            >
              {loading ? 'Analyzing...' : 'Analyze Connectivity'}
            </button>
            
            {message && (
              <div className="alert alert-info">
                <strong>Info:</strong> {message}
              </div>
            )}
          </div>
          
          <div className="visualization-area">
            <div className="section-title">Results - Reservoir Connectivity</div>
            
            <div className="metrics-grid">
              <div className="metric-card">
                <div className="metric-value">{wells.length}</div>
                <div className="metric-label">Available Wells</div>
              </div>
              <div className="metric-card">
                <div className="metric-value">{results.length}</div>
                <div className="metric-label">Measurements Found</div>
              </div>
            </div>
            
            <div className="results-table">
              {results.length > 0 ? (
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Tag</th>
                      <th>ICV</th>
                      <th>Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((result, index) => (
                      <tr key={index}>
                        <td>{index + 1}</td>
                        <td>{result.tag_name || result.file_name || 'N/A'}</td>
                        <td>{result.icv_name || result.icv || 'N/A'}</td>
                        <td>{result.type || 'ICV annular pressure'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
                    <div>Run analysis to see results</div>
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

export default ReservoirConnectivityAnalysis;