import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import OntologyUploadPage from './components/OntologyUpload';
import Caso1Page from './components/Caso1Page';
import Caso2Page from './components/Caso2Page';
import Caso3Page from './components/Caso3Page';
import AppLayout from './components/AppLayout';

const AppRoutes = () => {
  return (
    <Router>
      <Routes>
        {/* Ontology Upload */}
        <Route path="/" element={<OntologyUploadPage />} />

        {/* Caso 1 */}
        <Route
          path="/caso1"
          element={
            <AppLayout currentPage="caso1">
              <Caso1Page />
            </AppLayout>
          }
        />

        {/* Caso 2 */}
        <Route
          path="/caso2"
          element={
            <AppLayout currentPage="caso2">
              <Caso2Page />
            </AppLayout>
          }
        />

        {/* Caso 3 */}
        <Route
          path="/caso3"
          element={
            <AppLayout currentPage="caso3">
              <Caso3Page />
            </AppLayout>
          }
        />
      </Routes>
    </Router>
  );
};

export default AppRoutes;

