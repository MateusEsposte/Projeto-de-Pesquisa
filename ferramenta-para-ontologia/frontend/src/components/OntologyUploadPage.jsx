import React from 'react';
import AppLayout from './AppLayout';
import OntologyUpload from './OntologyUpload';

const OntologyUploadPage = () => (
  <AppLayout currentPage="upload">
    <div style={{ padding: '1.5rem 0' }}>
      <div className="page-container">
        <OntologyUpload />
      </div>
    </div>
  </AppLayout>
);

export default OntologyUploadPage;
