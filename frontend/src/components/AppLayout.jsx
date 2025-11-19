import React, { useState } from 'react';
import { 
  Database, 
  BarChart3, 
  Search, 
  Settings, 
  Upload, 
  FileText,
  Layers,
  Activity,
  Menu,
  X,
  ChevronRight,
  Home,
  TrendingUp,
  Waves,
  Network,
  Bell,
  User,
  LogOut
} from 'lucide-react';

const AppLayout = ({ children, currentPage = 'dashboard', ontologyData = null }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const navigationItems = [
    {
      section: 'Overview',
      items: [
        { 
          id: 'dashboard', 
          label: 'Dashboard', 
          icon: Home, 
          href: 'http://127.0.0.1:8000/',
          description: 'System overview and status'
        },
        { 
          id: 'upload', 
          label: 'Ontology Upload', 
          icon: Upload, 
          href: 'http://127.0.0.1:8000/',
          description: 'Import and manage ontology data'
        }
      ]
    },
    {
      section: 'Analysis Use Cases',
      items: [
        { 
          id: 'caso1', 
          label: 'ICV Pressure Analysis', 
          icon: Activity, 
          href: 'http://127.0.0.1:8000/caso1',
          description: 'Production loss investigation',
          badge: ontologyData ? 'Ready' : 'Load Data'
        },
        { 
          id: 'caso2', 
          label: 'Reservoir Connectivity', 
          icon: Network, 
          href: 'http://127.0.0.1:8000/caso2',
          description: 'Well interaction analysis',
          badge: ontologyData ? 'Ready' : 'Load Data'
        },
        { 
          id: 'caso3', 
          label: 'FPSO Flow Analysis', 
          icon: TrendingUp, 
          href: 'http://127.0.0.1:8000/caso3',
          description: 'Platform production monitoring',
          badge: ontologyData ? 'Ready' : 'Load Data'
        }
      ]
    },
    {
      section: 'Data Tools',
      items: [
        { 
          id: 'sparql', 
          label: 'SPARQL Editor', 
          icon: Database, 
          href: '/sparql',
          description: 'Custom query interface'
        },
        { 
          id: 'search', 
          label: 'Data Explorer', 
          icon: Search, 
          href: '/search',
          description: 'Browse ontology entities'
        },
        { 
          id: 'reports', 
          label: 'Analysis Reports', 
          icon: FileText, 
          href: '/reports',
          description: 'Generated insights and reports'
        }
      ]
    }
  ];

  const getPageInfo = (pageId) => {
    for (const section of navigationItems) {
      const item = section.items.find(item => item.id === pageId);
      if (item) return item;
    }
    return { label: 'Ontology Manager', description: '' };
  };

  const currentPageInfo = getPageInfo(currentPage);

  const handleNavigation = (href) => {
    window.location.href = href;
    setSidebarOpen(false);
  };

  return (
    <div style={{ 
      display: 'flex', 
      height: '100vh', 
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      background: '#f8fafc'
    }}>
      {/* Sidebar */}
      <aside style={{
        width: sidebarOpen ? '280px' : '280px',
        background: '#1e293b',
        color: 'white',
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        height: '100vh',
        zIndex: 1000,
        transform: window.innerWidth <= 1024 ? (sidebarOpen ? 'translateX(0)' : 'translateX(-100%)') : 'none',
        transition: 'transform 0.3s ease-in-out',
        borderRight: '1px solid #334155'
      }}>
        {/* Sidebar Header */}
        <div style={{ 
          padding: '1.5rem 1rem', 
          borderBottom: '1px solid #334155',
          background: '#0f172a'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.25rem',
              fontWeight: '700',
              color: '#1e293b'
            }}>
              S
            </div>
            <div>
              <div style={{ fontSize: '1.1rem', fontWeight: '600', lineHeight: '1.2' }}>
                EPOKS - Equipment Platform Ontology Knowlegde System
              </div>
              <div style={{ fontSize: '0.8rem', opacity: '0.7', lineHeight: '1.2' }}>
                Ontology Manager
              </div>
            </div>
          </div>

          {/* Status Indicator */}
          <div style={{ 
            marginTop: '12px', 
            padding: '8px 12px', 
            borderRadius: '6px',
            background: ontologyData ? '#065f46' : '#f8b500',
            fontSize: '0.75rem',
            fontWeight: '500',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            <div style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: ontologyData ? '#10b981' : '#f97316'
            }} />
            {ontologyData ? 'Ontology Loaded' : 'No Data Loaded'}
          </div>
        </div>

        {/* Navigation */}
        <nav style={{ 
          flex: 1, 
          overflowY: 'auto',
          padding: '1rem 0'
        }}>
          {navigationItems.map((section, index) => (
            <div key={index} style={{ marginBottom: '1.5rem' }}>
              <div style={{ 
                padding: '0 1rem',
                marginBottom: '0.5rem',
                fontSize: '0.75rem',
                fontWeight: '600',
                opacity: '0.6',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                {section.section}
              </div>
              
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = currentPage === item.id;
                
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNavigation(item.href)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px 1rem',
                      background: isActive ? '#334155' : 'transparent',
                      color: isActive ? '#f1f5f9' : '#cbd5e1',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                      fontWeight: isActive ? '600' : '500',
                      textAlign: 'left',
                      borderLeft: isActive ? '3px solid #fbbf24' : '3px solid transparent',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => !isActive && (e.target.style.background = '#475569')}
                    onMouseLeave={(e) => !isActive && (e.target.style.background = 'transparent')}
                  >
                    <Icon style={{ width: '18px', height: '18px', minWidth: '18px' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ lineHeight: '1.2' }}>{item.label}</div>
                      {item.description && (
                        <div style={{ 
                          fontSize: '0.75rem', 
                          opacity: '0.7', 
                          marginTop: '2px',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}>
                          {item.description}
                        </div>
                      )}
                    </div>
                    {item.badge && (
                      <div style={{
                        padding: '2px 6px',
                        borderRadius: '10px',
                        background: ontologyData ? '#10b981' : '#64748b',
                        fontSize: '0.65rem',
                        fontWeight: '600',
                        color: 'white'
                      }}>
                        {item.badge}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Sidebar Footer */}
        <div style={{ 
          padding: '1rem',
          borderTop: '1px solid #334155',
          background: '#0f172a'
        }}>
          <button
            onClick={() => handleNavigation('/settings')}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '8px',
              background: 'transparent',
              color: '#cbd5e1',
              border: '1px solid #334155',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.85rem'
            }}
          >
            <Settings style={{ width: '16px', height: '16px' }} />
            System Settings
          </button>
          
          <div style={{ 
            fontSize: '0.7rem', 
            color: '#64748b',
            textAlign: 'center',
            marginTop: '8px'
          }}>
            Version 2.1.0 • {new Date().getFullYear()}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div style={{ 
        flex: 1, 
        marginLeft: window.innerWidth <= 1024 ? '0' : '280px',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Header */}
        <header style={{
          background: 'white',
          borderBottom: '1px solid #e2e8f0',
          padding: '0 2rem',
          height: '72px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 0,
          zIndex: 100,
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              style={{
                display: window.innerWidth <= 1024 ? 'flex' : 'none',
                alignItems: 'center',
                justifyContent: 'center',
                width: '40px',
                height: '40px',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                background: 'white',
                cursor: 'pointer'
              }}
            >
              <Menu style={{ width: '18px', height: '18px' }} />
            </button>
            
            <div>
              <h1 style={{ 
                margin: 0, 
                fontSize: '1.5rem', 
                fontWeight: '700',
                color: '#1e293b',
                lineHeight: '1.2'
              }}>
                {currentPageInfo.label}
              </h1>
              
              {/* Breadcrumb */}
              <div style={{ 
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.8rem',
                color: '#64748b',
                marginTop: '2px'
              }}>
                <span>EPOKS - Equipment Platform Ontology System</span>
                <ChevronRight style={{ width: '12px', height: '12px' }} />
                <span>Ontology Systems</span>
                {currentPageInfo.description && (
                  <>
                    <ChevronRight style={{ width: '12px', height: '12px' }} />
                    <span>{currentPageInfo.description}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {/* Notifications */}
            <button style={{
              position: 'relative',
              padding: '8px',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              borderRadius: '6px'
            }}>
              <Bell style={{ width: '20px', height: '20px', color: '#64748b' }} />
              <div style={{
                position: 'absolute',
                top: '6px',
                right: '6px',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: '#ef4444'
              }} />
            </button>

            {/* Documentation */}
            <button
              onClick={() => handleNavigation('/docs')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 12px',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                background: 'white',
                cursor: 'pointer',
                fontSize: '0.85rem',
                color: '#475569'
              }}
            >
              <FileText style={{ width: '16px', height: '16px' }} />
              Docs
            </button>
            
            {/* User Menu */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  borderRadius: '8px'
                }}
              >
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: '600',
                  fontSize: '0.9rem',
                  color: 'white'
                }}>
                  PE
                </div>
                <div style={{ textAlign: 'left', display: window.innerWidth <= 768 ? 'none' : 'block' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: '600', color: '#1e293b' }}>
                    Petroleum Engineer
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    FPSO Energy
                  </div>
                </div>
              </button>

              {/* User Dropdown */}
              {userMenuOpen && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: '8px',
                  background: 'white',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                  minWidth: '200px',
                  zIndex: 1000
                }}>
                  <div style={{ padding: '12px', borderBottom: '1px solid #f1f5f9' }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: '600', color: '#1e293b' }}>
                      Petroleum Engineer
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      pe@energy.com
                    </div>
                  </div>
                  
                  <button style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '12px',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    color: '#475569',
                    textAlign: 'left'
                  }}>
                    <User style={{ width: '16px', height: '16px' }} />
                    Profile Settings
                  </button>
                  
                  <button style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '12px',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    color: '#dc2626',
                    textAlign: 'left',
                    borderTop: '1px solid #f1f5f9'
                  }}>
                    <LogOut style={{ width: '16px', height: '16px' }} />
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main style={{ 
          flex: 1, 
          overflowY: 'auto',
          background: '#f8fafc'
        }}>
          <div style={{ 
            maxWidth: '1400px',
            margin: '0 auto',
            padding: '2rem'
          }}>
            {children}
          </div>
        </main>
      </div>

      {/* Mobile Overlay */}
      {sidebarOpen && window.innerWidth <= 1024 && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.6)',
            zIndex: 999
          }}
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
};

export default AppLayout;