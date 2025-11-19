import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { FiUpload, FiFile, FiFolder, FiChevronRight, FiChevronDown, FiSearch, FiGrid, FiList, FiTag, FiUser, FiDatabase } from 'react-icons/fi';
import './base.css';
import AceEditor from 'react-ace';
import 'ace-builds/src-noconflict/mode-sparql';
import 'ace-builds/src-noconflict/theme-monokai';
import { useTable, usePagination } from 'react-table';
import Papa from 'papaparse';


const OntologyUpload = () => {
  // Estados existentes
  const [file, setFile] = useState(null);
  const [message, setMessage] = useState('');
  const [ontologyData, setOntologyData] = useState(null);
  const [expandedNodes, setExpandedNodes] = useState(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredHierarchy, setFilteredHierarchy] = useState([]);
  const [activeTab, setActiveTab] = useState('classes');
  const [showCreateClassForm, setShowCreateClassForm] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [selectedParents, setSelectedParents] = useState([]);
  const [exportFileName, setExportFileName] = useState('ontology.owl');
  const [showCreateIndividualForm, setShowCreateIndividualForm] = useState(false);
  const [newIndividualName, setNewIndividualName] = useState('');
  const [selectedIndividualClasses, setSelectedIndividualClasses] = useState([]);
  const [individualProperties, setIndividualProperties] = useState([]);
  const [newObjPropName, setNewObjPropName] = useState('');
  const [objDomain, setObjDomain] = useState([]);
  const [objRange, setObjRange] = useState([]);
  const [showCreateAnnoPropForm, setShowCreateAnnoPropForm] = useState(false);
  const [newAnnoPropName, setNewAnnoPropName] = useState('');
  const [annoDomain, setAnnoDomain] = useState([]);
  const [individualAnnotations, setIndividualAnnotations] = useState([]);
  const [objCharacteristics, setObjCharacteristics] = useState([]);
  const [objInverseOf, setObjInverseOf] = useState('');
  const [objSubProperties, setObjSubProperties] = useState([]);
  const [objEquivalents, setObjEquivalents] = useState([]);
  const [objDisjoints, setObjDisjoints] = useState([]);
  const [showObjectPropertyForm, setShowObjectPropertyForm] = useState(false);
  const [showDataPropForm, setShowDataPropForm] = useState(false);
  const [newDataPropName, setNewDataPropName] = useState('');
  const [dataDomain, setDataDomain] = useState([]);
  const [dataRangeType, setDataRangeType] = useState('');
  const [dataCharacteristics, setDataCharacteristics] = useState([]);
  const navigate = useNavigate();

  // Estados SPARQL
  const [sparqlQuery, setSparqlQuery] = useState('');
  const [sparqlResults, setSparqlResults] = useState([]);
  const [sparqlMessage, setSparqlMessage] = useState('');

  const [useCaseIdentifier, setUseCaseIdentifier] = useState('');
  const [useCaseIdType, setUseCaseIdType] = useState('auto');

  // Estados para Consultas Inteligentes
  const [constructs, setConstructs] = useState(null);
  const [selectedWell, setSelectedWell] = useState('');
  const [selectedComponentClass, setSelectedComponentClass] = useState('ICV');
  const [selectedMeasurementClass, setSelectedMeasurementClass] = useState('ICV_annular_pressure');
  const [tagsResult, setTagsResult] = useState([]);
  const [smartQueryLoading, setSmartQueryLoading] = useState(false);
  const [smartQueryMessage, setSmartQueryMessage] = useState('');
  const [useCaseType, setUseCaseType] = useState('use_case_1');
  const [returnMode, setReturnMode] = useState('tags'); 
  const [advancedPredicates, setAdvancedPredicates] = useState({
    measurement_class: 'o3po:ICV_annular_pressure',
    quality_predicate: 'core:qualityOf',
    component_predicate: 'o3po:component_of',
    tag_predicate: 'o3po:hasTag'
  });


  useEffect(() => {
    if (ontologyData) {
      axios.get('http://localhost:8000/api/query-builder-helper/')
        .then(res => {
          const data = res.data || {};
          // Compatibilidade: tenta primeiro available_constructs, depois constructs
          if (data.available_constructs) {
            setConstructs(data.available_constructs);
          } else if (data.constructs) {
            setConstructs(data.constructs);
          } else {
            setConstructs(data || {});
          }
        }).catch(err => {
          console.error(err);
          setSmartQueryMessage('Erro ao carregar constructs disponíveis');
        });
    }
  }, [ontologyData]);

  // Executa caso de uso inteligente (agora suporta use_case_1 e use_case_2)
  const handleSmartQuery = async () => {
    if (!selectedWell && useCaseType !== 'use_case_3') {
      setSmartQueryMessage('Informe o identificador (poço ou reservatório) — somente obrigatório para os casos 1 e 2');
      return;
    }

    setSmartQueryLoading(true);
    setSmartQueryMessage('Executando consulta...');

    try {
      const payload = {
        identifier: selectedWell,
        id_type: 'auto',
        measurement_class: `o3po:${selectedMeasurementClass}`,
        return: 'tags'
      };

      const endpoint = `http://localhost:8000/api/predefined-sparql/${useCaseType}/`;
      const res = await axios.post(endpoint, payload);

      // Normalize response (robusto contra diferentes formatos)
      const data = res.data || {};
      if (data.status && data.status !== 'success') {
        setSmartQueryMessage(`Erro: ${data.message || 'Resposta com status não-success'}`);
        setTagsResult([]);
        return;
      }

      // rows pode vir em data.results, data.instances, ou diretamente como array
      let rows = data.results || data.instances || data || [];
      if (!Array.isArray(rows)) {
        // Se o backend retornou {status:'success', results:{bindings: [...]}} ou similar
        if (rows.bindings && Array.isArray(rows.bindings)) rows = rows.bindings;
        else rows = [];
      }

      // Extrai tags de maneira resiliente
      const tags = rows.map(r => (r.tag || r.obj || r.suj || r.value || (r['?tag'] && r['?tag'].value) || (r['tag'] && r['tag'].value))).filter(Boolean);

      // Deduplicar
      const uniqueTags = Array.from(new Set(tags));
      setTagsResult(uniqueTags);
      setSmartQueryMessage(`Encontrados ${uniqueTags.length} tags para análise`);
    } catch (err) {
      console.error(err);
      setSmartQueryMessage('Erro ao executar: ' + (err.message || err.toString()));
      setTagsResult([]);
    } finally {
      setSmartQueryLoading(false);
    }
  };

  // Função para executar SPARQL
  const handleExecuteSparql = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/sparql-query/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: sparqlQuery }),
      });

      const data = await response.json();

      if (data.status === 'success') {
        setSparqlResults(data.results);
        setSparqlMessage('Query executada com sucesso!');
      } else {
        setSparqlMessage(`${data.message}`);
      }
    } catch (error) {
      setSparqlMessage(`Erro: ${error.message}`);
    }
  };

  const handleUseCase1 = async () => {
    if (!useCaseIdentifier) {
      setSparqlMessage('Informe o identificador do poço (nome, label ou IRI).');
      return;
    }

    setSparqlMessage('Executando consulta...');

    try {
      const payload = {
        identifier: useCaseIdentifier,
        id_type: useCaseIdType
      };

      const response = await fetch('http://localhost:8000/api/predefined-sparql/use_case_1/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (data.status === 'success') {
        setSparqlResults(data.results);
        setSparqlQuery(data.query || '');
        setSparqlMessage('Caso de Uso 1 executado com sucesso!');
      } else {
        setSparqlMessage(`${data.message || 'Erro desconhecido'}`);
      }

    } catch (err) {
      setSparqlMessage(`Erro: ${err.message}`);
    }
  };

    const handleUseCase3 = async () => {
    // identifier é opcional para o caso 3
    setSparqlMessage('Executando consulta do Caso 3...');
    try {
      const payload = {
        identifier: useCaseIdentifier || undefined,
        id_type: useCaseIdType
      };
      const response = await fetch('http://localhost:8000/api/predefined-sparql/use_case_3/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (data.status === 'success') {
        setSparqlResults(data.results);
        setSparqlQuery(data.query || '');
        setSparqlMessage('Caso de Uso 3 executado com sucesso!');
      } else {
        setSparqlMessage(`${data.message || 'Erro desconhecido'}`);
      }
    } catch (err) {
      setSparqlMessage(`Erro: ${err.message}`);
    }
  };

  // Exportar CSV dos resultados SPARQL
  const handleExportCsv = () => {
    if (sparqlResults.length === 0) {
      setMessage('Nenhum resultado para exportar!');
      return;
    }

    // Criar CSV manualmente
    const headers = ['suj', 'pred', 'obj'];
    const csvContent = [
      headers.join(','),
      ...sparqlResults.map(row => 
        headers.map(header => `"${row[header] || ''}"`).join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'sparql_results.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setMessage('CSV exportado com sucesso!');
    setTimeout(() => setMessage(''), 3000);
  };

  const handleExportOntology = () => {
    if (!ontologyData) {
      setMessage('Nenhuma ontologia carregada!');
      return;
    }
  
    const fileName = exportFileName.endsWith('.owl') ? exportFileName : `${exportFileName}.owl`;
    const exportUrl = `http://localhost:8000/export-ontology/?filename=${encodeURIComponent(fileName)}`;
  
    window.open(exportUrl, '_blank');
    setMessage(`Ontologia exportada como ${fileName}`);
    setTimeout(() => setMessage(''), 3000);
  };

  // Função para filtrar a hierarquia
  const filterHierarchy = (nodes, term) => {
    return nodes.map(node => {
      const isMatch = node.name.toLowerCase().includes(term.toLowerCase());
      const childrenMatches = node.children ? filterHierarchy(node.children, term) : [];
      
      return {
        ...node,
        isMatch,
        filteredChildren: childrenMatches,
        _show: isMatch || childrenMatches.length > 0
      };
    }).filter(node => node._show);
  };

  // Efeito para atualizar a hierarquia filtrada
  useEffect(() => {
    if (!ontologyData?.classes) return;
  
    if (searchTerm) {
      const filteredRoots = ontologyData.classes.map(root => filterHierarchy([root], searchTerm)).flat();
      setFilteredHierarchy(filteredRoots);

      const expandParents = (nodes) => {
        nodes.forEach(node => {
          if (node.filteredChildren?.length > 0) {
            setExpandedNodes(prev => new Set(prev).add(node.name));
            expandParents(node.filteredChildren);
          }
        });
      };
      expandParents(filteredRoots);
    } else {
      setFilteredHierarchy(ontologyData.classes);
    }
  }, [searchTerm, ontologyData?.classes]);
    
  const toggleNode = (nodeName) => {
    const newExpanded = new Set(expandedNodes);
    newExpanded.has(nodeName) ? newExpanded.delete(nodeName) : newExpanded.add(nodeName);
    setExpandedNodes(newExpanded);
  };

  const handlePropertyChange = (index, field, value) => {
    const newProperties = [...individualProperties];
    newProperties[index][field] = value;
    setIndividualProperties(newProperties);
  };
  
  const removeProperty = (index) => {
    setIndividualProperties(individualProperties.filter((_, i) => i !== index));
  };
  
  const handleCreateIndividual = async () => {
    try {
        const propertiesDict = individualProperties.reduce((acc, prop) => {
          if (prop.name && prop.value) {
            if (!acc[prop.name]) acc[prop.name] = [];
            acc[prop.name].push({
              value: prop.value,
              lang: prop.lang || null,
              datatype: prop.datatype || null
            });
          }
          return acc;
        }, {});

        const response = await axios.post('http://localhost:8000/create-individual/', {
          name: newIndividualName,
          classes: selectedIndividualClasses,
          properties: propertiesDict,
          annotations: individualAnnotations.reduce((acc, a) => {
            if (!acc[a.name]) acc[a.name] = [];
            acc[a.name].push(a.value);
            return acc;
          }, {}),
          object_properties: {}   
        });

      if (response.data.status === 'success') {
        setOntologyData(prev => ({
          ...prev,
          individuals: response.data.ontology.individuals
        }));
        setShowCreateIndividualForm(false);
        setMessage(`${response.data.message}`);
      }
    } catch (error) {
      setMessage(`Erro: ${error.response?.data?.message || error.message}`);
    }
  };

// Coloque isso dentro do componente OntologyUpload (antes do return), no mesmo nível das outras funções.
// Substitua o componente anterior por este (dentro de OntologyUpload, antes do return)
const ClassMultiSelect = ({ options = [], selected = [], onChange, placeholder = 'Search or select classes...' }) => {
  const [filter, setFilter] = useState('');
  const listRef = React.useRef(null);
  const holdInterval = React.useRef(null);

  // helper: aceita tanto option string quanto { name: '...' }
  const getName = (opt) => {
    const raw = (typeof opt === 'string') ? opt : (opt && opt.name ? opt.name : '');
    return raw;
  };

  // helper: extrai a parte "útil" do nome (local name após : # / )
  const getLocal = (s) => {
    if (!s) return '';
    // pega segmento após último :, # ou /
    const parts = s.split(/[:#\/]/);
    return parts[parts.length - 1];
  };

  // helper: normalize (lowercase + remove diacríticos)
  const normalize = (s) => {
    if (!s) return '';
    try {
      return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
    } catch (e) {
      // fallback se ambiente não suportar \p
      return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }
  };

  // memoiza o array transformado para performance
  const optionsProcessed = React.useMemo(() => {
    return options.map(o => {
      const name = getName(o);
      return {
        raw: o,
        name,
        local: getLocal(name),
        normName: normalize(name),
        normLocal: normalize(getLocal(name))
      };
    });
  }, [options]);

  const normalizedFilter = normalize(filter.trim());

  // filtra por nome completo ou pelo local name
  const filteredOptions = React.useMemo(() => {
    if (!normalizedFilter) return optionsProcessed;
    return optionsProcessed.filter(opt =>
      opt.normName.includes(normalizedFilter) || opt.normLocal.includes(normalizedFilter)
    );
  }, [optionsProcessed, normalizedFilter]);

  const toggleOption = (name) => {
    if (selected.includes(name)) onChange(selected.filter(s => s !== name));
    else onChange([...selected, name]);
  };

  const clearAll = () => onChange([]);

  const scrollBy = (amount) => {
    if (!listRef.current) return;
    listRef.current.scrollBy({ top: amount, behavior: 'smooth' });
  };

  const startHold = (amount) => {
    scrollBy(amount);
    holdInterval.current = setInterval(() => {
      if (listRef.current) listRef.current.scrollBy({ top: amount, behavior: 'auto' });
    }, 60);
  };

  const stopHold = () => {
    if (holdInterval.current) {
      clearInterval(holdInterval.current);
      holdInterval.current = null;
    }
  };

  useEffect(() => {
    return () => stopHold();
  }, []);

  return (
    <div className="class-multiselect">
      <div className="class-multiselect-top">
        <input
          type="text"
          className="class-search-input"
          placeholder={placeholder}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Buscar classes"
        />
        <div className="class-actions">
          {/* botão "Selecionar tudo" removido por pedido */}
          <button type="button" className="btn-secondary small" onClick={clearAll}>Limpar</button>
        </div>
      </div>

      <div className="class-list" role="listbox" tabIndex={0} ref={listRef}>
        <div className="class-list-inner" >
          {filteredOptions.length === 0 ? (
            <div className="class-empty">Nenhuma classe encontrada</div>
          ) : (
            filteredOptions.map(opt => {
              const name = opt.name;
              const isSelected = selected.includes(name);
              // destaque: mostra local name quando diferente
              const display = (opt.local && opt.local !== name) ? `${opt.local} — ${name}` : name;
              return (
                <label key={name} className={`class-item ${isSelected ? 'selected' : ''}`}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleOption(name)}
                  />
                  <span className="class-name" title={name}>{display}</span>
                </label>
              );
            })
          )}
        </div>
      </div>

      <div className="class-selected-preview">
        {selected.length > 0 ? (
          <div>
            <strong>Selecionadas:</strong> {selected.join(', ')}
          </div>
        ) : (
          <div className="class-none-selected">Nenhuma classe selecionada</div>
        )}
      </div>
    </div>
  );
};


  const renderNode = (currentNode, currentLevel = 0) => {
    const hasChildren = (currentNode.children?.length || 0) > 0;
    const isExpanded = expandedNodes.has(currentNode.name);
    const isMatch = currentNode.name.toLowerCase().includes(searchTerm.toLowerCase());

    return (
      <li key={currentNode.name} className="tree-node">
        <div
          className={`node-content ${hasChildren ? 'has-children' : ''} ${isMatch ? 'search-match' : ''}`}
          style={{ marginLeft: `${currentLevel * 20}px` }}
          onClick={() => hasChildren && toggleNode(currentNode.name)}
        >
          <div className="node-icons">
            {hasChildren && (
              <span className="toggle-icon">
                {isExpanded ? <FiChevronDown /> : <FiChevronRight />}
              </span>
            )}
            {hasChildren ? (
              <FiFolder className="node-icon" />
            ) : (
              <FiFile className="node-icon" />
            )}
          </div>
          <span className="node-label">
            {searchTerm && isMatch ? (
              <mark>{currentNode.name}</mark>
            ) : (
              currentNode.name
            )}
          </span>
        </div>
        
        {hasChildren && isExpanded && (
          <ul>
            {(searchTerm ? currentNode.filteredChildren : currentNode.children)?.map(childNode => (
              renderNode(childNode, currentLevel + 1)
            ))}
          </ul>
        )}
      </li>
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!file) {
      setMessage('Selecione um arquivo .owl primeiro!');
      return;
    }

    const formData = new FormData();
    formData.append('ontology_file', file);

    try {
      const response = await axios.post('http://localhost:8000/load-ontology/', formData, {
        withCredentials: true,
        headers: {
          'Content-Type': 'multipart/form-data',
          'X-Requested-With': 'XMLHttpRequest',
        }
      });
      
      setMessage(`${response.data.message}`);
      setOntologyData(response.data.ontology);
      setExpandedNodes(new Set());
    } catch (error) {
      setMessage(`Erro: ${error.response?.data?.message || error.message}`);
    }
  };

  const flattenClasses = (nodes) => {
    let flatList = [];
    nodes.forEach(node => {
      flatList.push({ name: node.name });
      if (node.children && node.children.length > 0) {
        flatList = flatList.concat(flattenClasses(node.children));
      }
    });
    return flatList;
  };

  const handleCreateClass = async () => {
    if (!newClassName) {
      alert('Informe o nome da nova classe!');
      return;
    }

    try {
      const response = await axios.post('http://localhost:8000/create-class/', {
        name: newClassName,
        parents: selectedParents
      }, {
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (response.data.status === 'success') {
        setOntologyData(prev => ({
          ...prev,
          classes: response.data.ontology.classes,
          classes_count: response.data.ontology.classes_count
        }));
        setShowCreateClassForm(false);
        setNewClassName('');
        setSelectedParents([]);
        setExpandedNodes(new Set()); 
        setMessage(`${response.data.message}`);
      } else {
        alert(response.data.message);
      }
    } catch (error) {
      alert(`Erro ao criar classe: ${error.response?.data?.message || error.message}`);
    }
  };

  const handleManageRelationship = async (subject, objectProperty, target, action, replaceWith = null) => {
    try {
      const response = await axios.post('http://localhost:8000/relationship-manager/', { 
        subject, 
        object_property: objectProperty, 
        target, 
        action, 
        replace_with: replaceWith 
      });
      if (response.data.status === 'success') {
        setOntologyData(prev => ({ 
          ...prev, 
          individuals: response.data.ontology.individuals 
        }));
      }
      setMessage(response.data.status === 'success' ? `${response.data.message}` : `${response.data.message}`);
    } catch (error) { 
      setMessage(`Erro: ${error.response?.data?.message || error.message}`); 
    }
  };

  // Updated PropertiesList
  const PropertiesList = ({ properties, type }) => (
    <div className="properties-container">
      {properties?.length > 0 ? (
        properties.map(prop => (
          <div key={prop.name} className="property-card">
            <h4>{prop.label || prop.name}</h4>
            <div className="property-meta">
              <span><strong>Nome:</strong> {prop.name}</span>
              <span><strong>IRI:</strong> {prop.iri || '-'}</span>

              {(type === 'object' || type === 'data') && (
                <>
                  <span><strong>Domain:</strong> {Array.isArray(prop.domain) ? prop.domain.join(', ') : (prop.domain || 'any')}</span>
                  <span><strong>Range:</strong> {Array.isArray(prop.range) ? prop.range.join(', ') : (prop.range || 'any')}</span>
                </>
              )}

              {type === 'annotation' && (
                <span><strong>Domain:</strong> {Array.isArray(prop.domain) ? prop.domain.join(', ') : (prop.domain || 'any')}</span>
              )}

              {typeof prop.is_functional === 'boolean' && (
                <span><strong>Funcional:</strong> {prop.is_functional ? 'Sim' : 'Não'}</span>
              )}
            </div>
          </div>
        ))
      ) : (
        <p>Nenhuma propriedade encontrada.</p>
      )}
    </div>
  );  

  const handleCreateObjectProperty = async () => {
    if (!newObjPropName || !objDomain[0] || !objRange[0]) {
      alert("Todos os campos são obrigatórios.");
      return;
    }

    const normalizedDomain = objDomain[0].trim().replace(/ /g, '');
    const normalizedRange = objRange[0].trim().replace(/ /g, '');

    try {
      const response = await fetch('http://localhost:8000/create_object_property/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_name: newObjPropName,
          domain: [normalizedDomain],
          range: [normalizedRange]
        })
      });

      const result = await response.json();
      if (result.status === 'success') {
        alert("Propriedade criada com sucesso!");
        setOntologyData(prev => ({
          ...prev,
          object_properties: result.object_properties
        }));
        setShowObjectPropertyForm(false);
        setNewObjPropName('');
        setObjDomain(['']);
        setObjRange(['']);
      } else {
        alert("Erro: " + result.message);
      }
    } catch (error) {
      console.error("Erro ao criar propriedade:", error);
      alert("Erro de rede ou servidor.");
    }
  };

  const handleCreateDataProperty = async () => {
    if (!newDataPropName || !dataRangeType) {
      alert('Nome e tipo de dado são obrigatórios.');
      return;
    }
    try {
      const payload = {
        property_name: newDataPropName.trim(),
        domain: dataDomain,
        range: dataRangeType,
        characteristics: dataCharacteristics
      };
      const response = await axios.post(
        'http://localhost:8000/create_data_property/',   
        payload,
        { headers: { 'Content-Type': 'application/json' } }
      );
      if (response.data.status === 'success') {
        setOntologyData(prev => ({
          ...prev,
          data_properties: response.data.data_properties
        }));
        setShowDataPropForm(false);
        setNewDataPropName('');
        setDataDomain([]);
        setDataRangeType('');
        setDataCharacteristics([]);
        setMessage(`${response.data.message}`);
      } else {
        alert('Erro: ' + response.data.message);
      }
    } catch (error) {
      console.error(error);
      alert('Erro ao criar DataProperty: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleCreateAnnotationProperty = async () => {
    if (!newAnnoPropName) return alert('Informe o nome da AnnotationProperty');
    try {
      const res = await axios.post('http://localhost:8000/create-annotation-property/', {
        name: newAnnoPropName,
        domain: annoDomain
      });
      if(res.data.status === 'success'){
        setOntologyData(prev => ({ 
          ...prev, 
          annotation_properties: res.data.annotation_properties 
        }));
        setShowCreateAnnoPropForm(false);
        setNewAnnoPropName(''); 
        setAnnoDomain([]);
        setMessage(`${res.data.message}`);
      } else alert(res.data.message);
    } catch(e){ 
      alert(`Erro: ${e.response?.data?.message || e.message}`); 
    }
  };

  // Object Property Form Component
  const ObjectPropertyForm = () => (
    <div className="create-property-form" style={{ 
      padding: '1rem',
      margin: '1rem 0',
      border: '1px solid #ddd',
      borderRadius: '5px',
      backgroundColor: '#f9f9f9'
    }}>
      <h3>Criar Nova Object Property</h3>
      
      <div className="form-group" style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem' }}>Nome da Propriedade:</label>
        <input
          type="text"
          value={newObjPropName}
          onChange={(e) => setNewObjPropName(e.target.value)}
          placeholder="Nome da propriedade"
          className="form-input"
          style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
        />
      </div>
      
      <div className="form-group" style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem' }}>Domínio: (Escolha uma classe)</label>
        <select
          value={objDomain[0] || ''}
          onChange={(e) => setObjDomain([e.target.value])}
          className="form-select"
          style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
        >
          <option value="">Selecione uma classe</option>
          {flattenClasses(ontologyData.classes).map(cls => (
            <option key={cls.name} value={cls.name}>{cls.name}</option>
          ))}
        </select>
        <small style={{ color: '#666', fontSize: '0.8rem' }}>O backend aceita apenas uma classe de domínio.</small>
      </div>
      
      <div className="form-group" style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem' }}>Range: (Escolha uma classe)</label>
        <select
          value={objRange[0] || ''}
          onChange={(e) => setObjRange([e.target.value])}
          className="form-select"
          style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
        >
          <option value="">Selecione uma classe</option>
          {flattenClasses(ontologyData.classes).map(cls => (
            <option key={cls.name} value={cls.name}>{cls.name}</option>
          ))}
        </select>
        <small style={{ color: '#666', fontSize: '0.8rem' }}>O backend aceita apenas uma classe de range.</small>
      </div>
      
      <div className="form-actions" style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
        <button 
          onClick={handleCreateObjectProperty} 
          className="submit-btn"
          style={{ padding: '8px 16px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
        >
          Criar Propriedade
        </button>
        <button 
          onClick={() => setShowObjectPropertyForm(false)} 
          className="cancel-btn"
          style={{ padding: '8px 16px', backgroundColor: '#f44336', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
        >
          Cancelar
        </button>
      </div>
    </div>
  );

  // Componente de Tabela de Resultados SPARQL
  const ResultsTable = ({ data }) => {
    return (
      <div className="results-table-container">
        <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #ddd' }}>
          <thead>
            <tr style={{ backgroundColor: '#f5f5f5' }}>
              <th style={{ border: '1px solid #ddd', padding: '8px' }}>Suj</th>
              <th style={{ border: '1px solid #ddd', padding: '8px' }}>Pred</th>
              <th style={{ border: '1px solid #ddd', padding: '8px' }}>Obj</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, index) => (
              <tr key={index}>
                <td style={{ border: '1px solid #ddd', padding: '8px' }}>{row.suj}</td>
                <td style={{ border: '1px solid #ddd', padding: '8px' }}>{row.pred}</td>
                <td style={{ border: '1px solid #ddd', padding: '8px' }}>{row.obj}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const flattenedClassOptions = React.useMemo(() => {
  return ontologyData?.classes ? flattenClasses(ontologyData.classes) : [];
}, [ontologyData]);

  return (
    <div className="ontology-upload">
      <div className="upload-form">
        <h2>Ontology Loader</h2>
        <form onSubmit={handleSubmit}>
          <div className="file-input-wrapper">
            <input
              type="file"
              accept=".owl"
              onChange={(e) => setFile(e.target.files[0])}
              className="file-input"
              id="ontology-file"
            />
            <label htmlFor="ontology-file" className="upload-button">
              <FiUpload style={{ marginRight: '8px' }} />
              {file ? file.name : 'Choose OWL File'}
            </label>
          </div>
          <button type="submit" className="upload-button">
            Load Ontology
          </button>
        </form>

        {message && (
          <div className={`message ${message.includes('') ? 'success' : 'error'}`}>
            {message}
          </div>
        )}
      </div>

      {ontologyData && (
        <div className="ontology-view">
          <div className="ontology-tabs">
            <button
              className={`tab-btn ${activeTab === 'classes' ? 'active' : ''}`}
              onClick={() => setActiveTab('classes')}
            >
              <FiGrid /> Classes ({ontologyData.classes_count})
            </button>
            <button
              className={`tab-btn ${activeTab === 'individuals' ? 'active' : ''}`}
              onClick={() => setActiveTab('individuals')}
            >
              <FiUser /> Indivíduos ({ontologyData.individuals.length})
            </button>
            <button
              className={`tab-btn ${activeTab === 'object_properties' ? 'active' : ''}`}
              onClick={() => setActiveTab('object_properties')}
            >
              <FiList /> Object Properties ({ontologyData.object_properties ? ontologyData.object_properties.length : 0})
            </button>
            <button
              className={`tab-btn ${activeTab === 'data_properties' ? 'active' : ''}`}
              onClick={() => setActiveTab('data_properties')}
            >
              <FiTag /> Data Properties ({ontologyData.data_properties.length})
            </button>
            <button 
              onClick={() => navigate('/caso1', { state: { ontologyData } })}
              style={{
                padding: '10px 15px',
                backgroundColor: '#ffcb3b',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                marginLeft: '10px'
              }}
            >
              Investigar Perda de Produção
            </button>
            <button 
              onClick={() => navigate('/caso2', { state: { ontologyData } })}
              className="btn-use-case"
            >
              Conectividade de Reservatório
            </button>
            <button 
              onClick={() => navigate('/caso3', { state: { ontologyData } })}
              className="btn-use-case"
            >
              Vazão da FPSO
            </button>
          </div>

          <div className="tab-content">
            {activeTab === 'classes' && (
              <div className="tab-section">
                <div className="card">
                  <h3 className="card-title">Hierarquia de Classes</h3>

                  <div className="search-box">
                    <FiSearch className="search-icon" />
                    <input
                      type="text"
                      placeholder="Search classes..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="search-input"
                    />
                  </div>

                  <div className="create-class-actions">
                    <button
                      className="btn-primary small"
                      onClick={() => setShowCreateClassForm(!showCreateClassForm)}
                    >
                      + New Class
                    </button>
                  </div>

                  {showCreateClassForm && (
                    <div className="form-card">
                      <input
                        type="text"
                        placeholder="New Class Name"
                        value={newClassName}
                        onChange={(e) => setNewClassName(e.target.value)}
                        className="form-control"
                      />
                      <select
                        multiple
                        value={selectedParents}
                        onChange={(e) => {
                          const options = Array.from(e.target.selectedOptions, option => option.value);
                          setSelectedParents(options);
                        }}
                        className="form-control"
                      >
                        {flattenClasses(ontologyData.classes).map(cls => (
                          <option key={cls.name} value={cls.name}>{cls.name}</option>
                        ))}
                      </select>

                      <div className="form-actions">
                        <button onClick={handleCreateClass} className="btn-primary">Create</button>
                        <button onClick={() => setShowCreateClassForm(false)} className="btn-secondary">Cancel</button>
                      </div>
                    </div>
                  )}

                  <ul className="tree-list">
                    {(filteredHierarchy || ontologyData.classes).map(root => (
                      renderNode(root)
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {activeTab === 'individuals' && (
              <div className="tab-section">
                <div className="card">
                  <div className="section-header">
                    <h3 className="card-title">Individuals</h3>
                    <button
                      className="btn-primary small"
                      onClick={() => {
                        setNewIndividualName('');
                        setSelectedIndividualClasses([]);
                        setIndividualProperties([]);
                        setIndividualAnnotations([]);
                        setShowCreateIndividualForm(true);
                      }}
                    >
                      + New Individual
                    </button>
                  </div>

                  {showCreateIndividualForm && (
                    <div className="form-card">
                  <div className="create-individual-form">
                    <input
                      type="text"
                      placeholder="Individual Name"
                      value={newIndividualName}
                      onChange={(e) => setNewIndividualName(e.target.value)}
                    />

                    {/* AQUI: substituí select multiple por ClassMultiSelect */}
                    <ClassMultiSelect
                      options={flattenedClassOptions}
                      selected={selectedIndividualClasses}
                      onChange={setSelectedIndividualClasses}
                      placeholder="Buscar/selecionar classes para o indivíduo..."
                    />

                    <div className="properties-inputs">
                      {individualProperties.map((prop, index) => (
                        <div key={index} className="property-row">
                          <select
                            value={prop.name}
                            onChange={(e) => handlePropertyChange(index, 'name', e.target.value)}
                          >
                            <option value="">Select a Data Property</option>
                            {ontologyData.data_properties.map(p => (
                              <option key={p.name} value={p.name}>{p.name}</option>
                            ))}
                          </select>  
                          <input
                            type="text"
                            placeholder="Value"
                            value={prop.value}
                            onChange={(e) => handlePropertyChange(index, 'value', e.target.value)}
                          />
                          <input
                            type="text"
                            placeholder="Language tag (optional)"
                            value={prop.lang}
                            onChange={(e) => handlePropertyChange(index, 'lang', e.target.value)}
                          />
                          <select
                            value={prop.datatype}
                            onChange={(e) => handlePropertyChange(index, 'datatype', e.target.value)}
                            disabled={!ontologyData?.datatypes}
                          >
                            <option value="">Select a datatype</option>
                            {ontologyData?.datatypes?.map(dt => (
                              <option key={dt} value={dt}>{dt}</option>
                            ))}
                          </select>
                          <button
                            className="remove-property-btn"
                            onClick={() => removeProperty(index)}
                          >
                            ×
                          </button>
                        </div>
                      ))}

                      <button
                        className="add-property-btn"
                        onClick={() => setIndividualProperties([...individualProperties, { name: '', values: '' }])}
                      >
                        + Add Property
                      </button>
                    </div>

                    <div className="annotations-inputs">
                      <h5>Anotações</h5>
                      {individualAnnotations.map((anno, idx) => (
                        <div key={idx} className="annotation-row">
                          <select
                            value={anno.name}
                            onChange={e => {
                              const a = [...individualAnnotations];
                              a[idx].name = e.target.value;
                              setIndividualAnnotations(a);
                            }}
                          >
                            <option value="">Selecione uma AnnotationProperty</option>
                            {ontologyData.annotation_properties.map(p => (
                              <option key={p.name} value={p.name}>{p.name}</option>
                            ))}
                          </select>
                          <input
                            type="text"
                            placeholder="Valor da anotação"
                            value={anno.value}
                            onChange={e => {
                              const a = [...individualAnnotations];
                              a[idx].value = e.target.value;
                              setIndividualAnnotations(a);
                            }}
                          />
                          <button onClick={() => {
                            setIndividualAnnotations(individualAnnotations.filter((_,i) => i!==idx));
                          }}>×</button>
                        </div>
                      ))}
                      <button onClick={() => setIndividualAnnotations([...individualAnnotations, { name:'', value:'' }])}>
                        + Add Anotation
                      </button>
                    </div>

                    <div className="form-actions">
                      <button className="submit-btn" onClick={handleCreateIndividual}>Create</button>
                      <button className="cancel-btn" onClick={() => setShowCreateIndividualForm(false)}>Cancel</button>
                    </div>
                  </div>
                    </div>
                  )}

                  <div className="grid-list">
                    {ontologyData.individuals.map(ind => (
                      <div key={ind.name} className="info-card">
                        <h4>{ind.name}</h4>
                        {ind.type?.length > 0 && <p><strong>Tipo:</strong> {ind.type.join(', ')}</p>}
                        {ind.properties && Object.keys(ind.properties).length > 0 && (
                          <div>
                            <h5>Properties</h5>
                            {Object.entries(ind.properties).map(([prop, values]) => (
                              <p key={prop}><strong>{prop}:</strong> {values.join(', ')}</p>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* restante do conteúdo: object_properties, data_properties, export_section, etc. - sem alteração */}

            {activeTab === 'object_properties' && (
              /* ... conteúdo existente ... */
              <div className="tab-section">
                {/* (mantive seu código original para object_properties) */}
                <div className="card">
                  <div className="section-header">
                    <h3 className="card-title">Object Properties</h3>
                    <button
                      className="btn-primary small"
                      onClick={() => setShowObjectPropertyForm(!showObjectPropertyForm)}
                    >
                      + New Property
                    </button>
                  </div>

                  {showObjectPropertyForm && <ObjectPropertyForm />}

                  <PropertiesList properties={ontologyData.object_properties} type="object" />

                  <div className="form-card">
                    <h4>Manage Relationship</h4>
                <div className="relationship-form">
                  <h4>Manage Relationship</h4>
                  <select id="rel-subject">
                    {ontologyData.individuals.map(ind => (
                      <option key={ind.name} value={ind.name}>{ind.name}</option>
                    ))}
                  </select>
                  <select id="rel-property">
                    {ontologyData.object_properties && Array.isArray(ontologyData.object_properties) && ontologyData.object_properties.map(prop => (
                      <option key={prop.name} value={prop.name}>{prop.name}</option>
                    ))}
                  </select>
                  <select id="rel-target">
                    {ontologyData.individuals.map(ind => (
                      <option key={ind.name} value={ind.name}>{ind.name}</option>
                    ))}
                  </select>
                  <select id="rel-action">
                    <option value="add">Add</option>
                    <option value="remove">Remove</option>
                    <option value="replace">Replace</option>
                  </select>
                  <input
                    id="rel-replace-with"
                    type="text"
                    placeholder="New target (for replacement)"
                  />
                  <button
                    onClick={() => {
                      const subject = document.getElementById('rel-subject').value;
                      const prop = document.getElementById('rel-property').value;
                      const target = document.getElementById('rel-target').value;
                      const action = document.getElementById('rel-action').value;
                      const replaceWith =
                        document.getElementById('rel-replace-with').value || null;
                      handleManageRelationship(
                        subject,
                        prop,
                        target,
                        action,
                        replaceWith
                      );
                    }}
                  >
                    Execute
                  </button>
                </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'data_properties' && (
              /* ... sem alterações significativas ... */
              <div className="tab-section">
                <div className="card">
                  <div className="section-header">
                    <h3 className="card-title">Data Properties</h3>
                    <button
                      className="btn-primary small"
                      onClick={() => setShowDataPropForm(!showDataPropForm)}
                    >
                      + New Data Property
                    </button>
                  </div>

                  {showDataPropForm && (
                    <div className="form-card">
                  <div className="create-prop-form">
                    <input 
                      placeholder="Nome da DataProperty" 
                      value={newDataPropName} 
                      onChange={e => setNewDataPropName(e.target.value)} 
                    />
                    <label>Domain (classes):</label>
                    <select 
                      multiple 
                      value={dataDomain} 
                      onChange={e => setDataDomain(Array.from(e.target.selectedOptions, opt => opt.value))}
                    >
                      {flattenClasses(ontologyData.classes).map(c => (
                        <option key={c.name} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                    <label>Range (data type):</label>
                    <select 
                      value={dataRangeType} 
                      onChange={e => setDataRangeType(e.target.value)}
                    >
                      <option value="">Select type</option>
                      {ontologyData.datatypes.map(dt => (
                        <option key={dt} value={dt}>{dt}</option>
                      ))}
                    </select>
                    <label>Characteristics:</label>
                    <select
                      multiple
                      value={dataCharacteristics}
                      onChange={e => setDataCharacteristics(Array.from(e.target.selectedOptions, opt => opt.value))}
                    >
                      <option value="functional">Functional</option>
                    </select>
                    <div style={{ marginTop: '8px' }}>
                      <button onClick={handleCreateDataProperty}>Create</button>
                      <button onClick={() => setShowDataPropForm(false)}>Cancel</button>
                    </div>
                  </div>
                    </div>
                  )}

                  <PropertiesList properties={ontologyData.data_properties} type="data" />
                </div>
              </div>
            )}

            <div className="export-section" style={{ marginTop: '30px', paddingTop: '20px', borderTop: '1px solid #ddd' }}>
              <h3>Export Ontology</h3>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <input
                  type="text"
                  value={exportFileName}
                  onChange={(e) => setExportFileName(e.target.value)}
                  placeholder="Nome do arquivo .owl"
                  style={{
                    padding: '10px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    flex: 1
                  }}
                />
                <button
                  onClick={handleExportOntology}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#ffcb3b',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  Export Ontology
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OntologyUpload;