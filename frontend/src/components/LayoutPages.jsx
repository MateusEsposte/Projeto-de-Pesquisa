import React from 'react';
import AppLayout from './AppLayout';
import Caso1Professional from './Caso1Page';
import OntologyUpload from './OntologyUpload';

// Página Caso 1 dentro do layout
export function Caso1Page(props) {
  return (
    <AppLayout currentPage="caso1">
      <div className="content-section">
        <Caso1Professional {...props} />
      </div>
    </AppLayout>
  );
}

// Página Ontology Upload dentro do layout
export function OntologyUploadPage() {
  return (
    <AppLayout currentPage="upload">
      <div className="content-section">
        <OntologyUpload />
      </div>
    </AppLayout>
  );
}
