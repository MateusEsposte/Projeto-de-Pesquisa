import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts';
import './productionloss.css'; 

const ProductionLossAnalysis = ({ apiBase = 'http://localhost:8000' }) => {
  const [wells, setWells] = useState([]);
  const [selectedWell, setSelectedWell] = useState('');
  const [tags, setTags] = useState([]);
  const [timeseriesData, setTimeseriesData] = useState({});
  const [selectedTag, setSelectedTag] = useState(null);
  const [loading, setLoading] = useState(false);
  const [timeseriesLoading, setTimeseriesLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [measurementClass] = useState('o3po:ICV_annular_pressure');
  const [qualityPred] = useState('core:qualityOf');
  const [componentPred] = useState('o3po:component_of');
  const [tagPred] = useState('o3po:hasTag');

      const localNameFromIri = (iri) => {
      try {
        if (!iri) return '';
        const s = String(iri);
        if (s.includes('#')) return s.split('#').pop();
        return s.split('/').pop();
      } catch (e) { return String(iri); }
    };

    const getSelectedWellDisplay = (selected) => {
      if (!selected) return 'SELECTED_WELL';
      // se o selected for um objeto ou já for o nome, trate adequadamente:
      if (typeof selected === 'object' && selected.value) return localNameFromIri(selected.value);
      const s = String(selected);
      // se parece IRI, extrai local-name, caso contrário retorna o próprio valor
      return s.includes('http') ? localNameFromIri(s) : s;
    };

  // Fetch wells from ontology
useEffect(() => {
  const fetchOntology = async () => {
    try {
      const res = await axios.get(`${apiBase}/api/current-ontology/`);
      const ontology = res.data?.ontology || res.data || null;

      if (ontology && Array.isArray(ontology.individuals)) {
        // helper: pega local-name de uma IRI
        const localNameFromIri = (iri) => {
          try {
            if (!iri) return '';
            const s = String(iri);
            if (s.includes('#')) return s.split('#').pop();
            return s.split('/').pop();
          } catch (e) { return String(iri); }
        };

        // normaliza tipos que vierem do backend
        const getTypeLocalNames = (ind) => {
          const types = ind.types_local || ind.type || [];
          const arr = typeof types === 'string' ? [types] : (Array.isArray(types) ? types : []);
          return arr.map(t => localNameFromIri(t)).filter(Boolean);
        };

        // filtro robusto (renomeado para filteredWells)
        const filteredWells = ontology.individuals
          .filter(ind => {
            // se backend já deu flag is_well, use-a (mais confiável)
            if (ind.is_well === true) return true;

            // checa types locais
            const typeNames = getTypeLocalNames(ind).map(s => s.toLowerCase());
            if (typeNames.some(n => /\b(well|poco|poço)\b/i.test(n))) return true;

            // checa name
            if (ind.name && /\b(well|poco|poço)\b/i.test(localNameFromIri(ind.name))) return true;

            // checa label (label pode ser array ou string)
            const labelText = Array.isArray(ind.label) ? ind.label.join(' ') : (ind.label || '');
            if (labelText && /\b(well|poco|poço)\b/i.test(labelText)) return true;

            return false;
          })
          .map(ind => ({
            value: ind.iri || ind.name || '',
            label: ind.name || (Array.isArray(ind.label) ? ind.label[0] : ind.label) || localNameFromIri(ind.iri) || 'Unnamed'
          }));

        setWells(filteredWells);
        if (filteredWells.length > 0 && !selectedWell) {
          setSelectedWell(filteredWells[0].value);
        }
      }
    } catch (err) {
      console.error('Erro ao buscar ontologia:', err);
      setMessage('Erro ao carregar lista de poços');
    }
  };

  fetchOntology();
}, [apiBase]); 


  // Função para executar a consulta SPARQL
  const runQuery = async () => {
    if (!selectedWell) {
      setMessage('Selecione um poço para análise.');
      return;
    }

    setLoading(true);
    setMessage('Executando consulta...');
    setTags([]);
    setTimeseriesData({});
    
    try {
      const payload = {
        identifier: selectedWell,
        id_type: 'auto',
        measurement_class: measurementClass,
        quality_predicate: qualityPred,
        component_predicate: componentPred,
        tag_pred: tagPred,
      };
      
      const res = await axios.post(`${apiBase}/api/predefined-sparql/use_case_1/`, payload);
      const data = res.data || {};
      
      let rows = [];
      if (Array.isArray(data.results)) {
        rows = data.results;
      } else if (Array.isArray(data.instances)) {
        rows = data.instances;
      } else if (data.bindings && Array.isArray(data.bindings)) {
        rows = data.bindings;
      } else if (Array.isArray(data)) {
        rows = data;
      }
      
      if (!rows.length) {
        setMessage(data.message || 'Nenhuma tag encontrada.');
        setTags([]);
        return;
      }
      
      const normalized = rows.map(r => {
        const file = r.file?.value ?? r.file ?? r.tag?.value ?? r.tag ?? null;
        const fileName = r.file_name ?? r.tag_name ?? (file ? localNameFromIri(file) : '');
        const icv = r.icv?.value ?? r.icv ?? null;
        const icvName = r.icv_name ?? (icv ? localNameFromIri(icv) : '');
        return { id: file, fileName, icv, icvName };
      }).filter(Boolean).filter(it => it.id);
      
      // Remover duplicatas
      const seen = new Set();
      const unique = [];
      normalized.forEach(n => {
        if (!seen.has(n.id)) {
          seen.add(n.id);
          unique.push(n);
        }
      });
      
      setTags(unique);
      setMessage(`Encontradas ${unique.length} tags para análise.`);
      
    } catch (err) {
      console.error(err);
      const backendMsg = err.response?.data?.message || err.message || 'Erro desconhecido';
      setMessage(`Erro ao executar consulta: ${backendMsg}`);
      setTags([]);
    } finally {
      setLoading(false);
    }
  };

  // Função para buscar série temporal de uma tag específica
  const fetchTimeseries = async (tagId) => {
    setSelectedTag(tagId);
    setTimeseriesLoading(true);
    setMessage(`Carregando série temporal para ${localNameFromIri(tagId)}...`);

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

      setTimeseriesData({ [tagId]: chartData });
      setMessage(`Série temporal carregada (${chartData.length} pontos)`);
    } catch (e) {
      console.error(e);
      setMessage('Não foi possível carregar a série temporal');
      setTimeseriesData({ [tagId]: [] });
    } finally {
      setTimeseriesLoading(false);
    }
  };


  useEffect(() => {
    if (selectedWell) {
      runQuery();
    }
  }, [selectedWell]);

  // Preparar dados para o gráfico
  const selectedTagData = selectedTag && timeseriesData[selectedTag] ? timeseriesData[selectedTag] : [];
  const chartData = selectedTagData.map(item => ({
    time: new Date(item.t).toLocaleTimeString(),
    value: item.v
  }));

  return (
    <div className="production-loss-container">
      <div className="header">
        <h1>ICV Analysis - Production Loss Investigation</h1>
        <p className="subtitle">Evaluation of inflow control valve sealing</p>
      </div>
      
      <div className="container">
        <div className="sidebar">
          <div className="section-title">Well Selection</div>
          <div className="well-selector">
            <select 
              value={selectedWell} 
              onChange={(e) => setSelectedWell(e.target.value)}
              disabled={loading}
            >
              <option value="">-- Select well --</option>
              {wells.map(well => (
                <option key={well.value} value={well.value}>{well.label}</option>
              ))}
            </select>
          </div>
          
          <div className="section-title">Detected ICVs</div>
          <div className="icv-list">
            {tags.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#718096' }}>
                <div>No ICV found</div>
                <div style={{ fontSize: '0.8rem' }}>Run a query to see results</div>
              </div>
            ) : (
              tags.map(tag => (
                <div key={tag.id} className="icv-item">
                  <input 
                    type="radio" 
                    className="icv-checkbox" 
                    name="selectedIcv"
                    checked={selectedTag === tag.id}
                    onChange={() => fetchTimeseries(tag.id)}
                  />
                  <div className="icv-info">
                    <div className="icv-name">{tag.icvName || tag.fileName}</div>
                    <div className="icv-status">
                      <span className="status-indicator" style={{ backgroundColor: '#718096' }}></span>
                      Tag: {tag.fileName}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
          
          <div className="section-title">Information</div>
          <div className="analysis-panel">
            <div className="analysis-title">Query Status</div>
            <div className="analysis-item">
              <span>Total ICVs</span>
              <span>{tags.length}</span>
            </div>
            <div className="analysis-item">
              <span>Selected Tag</span>
              <span>{selectedTag ? localNameFromIri(selectedTag) : 'Nenhuma'}</span>
            </div>
            <div className="analysis-item">
              <span>Data Points</span>
              <span>{selectedTagData.length}</span>
            </div>
          </div>
        </div>
        
        <div className="main-content">
          <div className="query-section">
            <div className="section-title">Automated DL Query</div>
            <div className="query-input">
              <textarea 
                id="queryText" 
                readOnly 
                value={`'is about' some ('ICV annular pressure' and 'quality of' some ('inflow control valve' and 'component of' value ${getSelectedWellDisplay(selectedWell)}))`} 
              />
            </div>
            <button className="btn btn-primary" onClick={runQuery} disabled={loading || !selectedWell}>
              {loading ? 'Running...' : 'Run Query'}
            </button>
            
            <div className="query-results">
              <strong>Results ({tags.length}):</strong><br />
              {tags.map(tag => (
                <div key={tag.id}>◆ {tag.fileName}</div>
              ))}
            </div>
            
            {message && (
              <div className="alert alert-info">
                <strong>Info:</strong> {message}
              </div>
            )}
          </div>
          
          <div className="visualization-area">
            <div className="section-title">Visualization - Annular Pressures</div>
            
            <div className="metrics-grid">
              <div className="metric-card">
                <div className="metric-value">{tags.length}</div>
                <div className="metric-label">Detected ICVs</div>
              </div>
              <div className="metric-card">
                <div className="metric-value">{selectedTag ? '1' : '0'}</div>
                <div className="metric-label">Active Tag</div>
              </div>
              <div className="metric-card">
                <div className="metric-value">{selectedTagData.length}</div>
                <div className="metric-label">Data Points</div>
              </div>
              <div className="metric-card">
                <div className="metric-value">{selectedWell ? 'Active' : 'Inactive'}</div>
                <div className="metric-label">Status</div>
              </div>
            </div>
            
            <div className="chart-container">
              {timeseriesLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                  <div>Loading time series...</div>
                </div>
              ) : chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" />
                    <YAxis />
                    <Tooltip />
                    <Line 
                      type="monotone"
                      dataKey="value"
                      stroke="#ffcb3b"
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
                    <div>Select an ICV to view data</div>
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

export default ProductionLossAnalysis;