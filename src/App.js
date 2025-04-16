import React from 'react';
import './App.css';
import AcademicPaperVisualization from './components/AcademicPaperVisualization';

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <div className="container">
          <h1>Academic Paper Visualization</h1>
          <p>Interactive exploration and analysis of research papers</p>
        </div>
      </header>
      <main className="App-main">
        <AcademicPaperVisualization />
      </main>
      <footer className="App-footer">
        <div className="container">
          <p>© {new Date().getFullYear()} Academic Paper Visualization Project</p>
        </div>
      </footer>
    </div>
  );
}

export default App;