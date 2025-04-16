import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as d3 from 'd3';
import * as UMAP from 'umap-js';
import { kmeans } from 'ml-kmeans';
import _ from 'lodash';
import Papa from 'papaparse';
//import { loadPaperData, searchPapers } from './PaperDataLoader';
//import { extractMeaningfulKeywords } from './keywordExtractor';

const OptimizedAcademicPaperVisualization = () => {
  // State variables
  const [papers, setPapers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedPaper, setSelectedPaper] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('visualization');
  
  // Add computation state tracking for better UX
  const [computeState, setComputeState] = useState({
    umapComputed: false,
    clusteringComputed: false,
    isComputing: false,
    computingTask: null,
    progress: 0
  });
  
  // Visualization state
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [umapResult, setUmapResult] = useState(null);
  
  // Visualization controls
  const [computeClusters, setComputeClusters] = useState(true);
  const [maxClusters] = useState(12);
  const [colorBy, setColorBy] = useState('score');
  const [colorScheme, setColorScheme] = useState('categorical');
  
  // Refs
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  // Maintain visualization state in a ref to avoid extra re-renders
  const visualizationRef = useRef({
    isInitialized: false,
    nodesData: [],
    simulation: null,
    zoomBehavior: null
  });

  // Generate mock data with a fixed seed for stability
  const generateMockData = useCallback((count = 500) => {
    const seededRandom = (seed) => {
      let m = 2**35 - 31;
      let a = 185852;
      let s = seed % m;
      return function() {
        return (s = s * a % m) / m;
      };
    };
    
    const rand = seededRandom(123456); // Fixed seed
    
    return Array.from({ length: count }, (_, index) => {
      // Generate stable embeddings using the seeded random function
      const embedding = Array.from({ length: 50 }, () => rand() * 2 - 1);
      
      return {
        id: `paper-${index}`,
        title: `Academic Paper ${index} on ${
          index % 3 === 0 ? 'Machine Learning and Text Processing' : 
          index % 3 === 1 ? 'Data Visualization Techniques' : 'Human-Computer Interaction'
        }`,
        authors: `Author ${index % 5 + 1}, Author ${(index % 3) + 5}`,
        abstract: `This is an abstract for paper ${index} discussing important research in the field of ${
          index % 3 === 0 ? 'machine learning' : 
          index % 3 === 1 ? 'data visualization' : 'human-computer interaction'
        }. The paper presents novel approaches to ${
          index % 2 === 0 ? 'improving user experience' : 'enhancing system performance'
        } through innovative methods.`,
        venue: `Conference ${index % 5 + 1}`,
        year: 2020 + (index % 5),
        type: index % 3 === 0 ? 'Full Paper' : index % 3 === 1 ? 'Short Paper' : 'Poster',
        link: `#paper-${index}`,
        embedding: embedding,
        score: 0,
        cluster: null
      };
    });
  }, []);

  // Load papers - modified to match AcademicPaperVisualization.js approach
  useEffect(() => {
    const loadPapers = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        // Try to load CSV file
        try {
          // First try to load CSV from public folder if not in window.fs environment
          let csvText;
          try {
            if (window.fs) {
              // Try to read from window.fs
              csvText = await window.fs.readFile('unique_papers.csv', { encoding: 'utf8' });
            } else {
              // Try to fetch from public folder
              const response = await fetch(`${process.env.PUBLIC_URL}/data/unique_papers.csv`);
              csvText = await response.text();
            }
            
            // Parse the CSV data using PapaParse
            Papa.parse(csvText, {
              header: true,
              dynamicTyping: true,
              skipEmptyLines: true,
              complete: (results) => {
                if (results.errors.length > 0) {
                  console.error('CSV parsing errors:', results.errors);
                  throw new Error(`Failed to parse CSV: ${results.errors[0].message}`);
                }
                
                // Process the paper data
                const processedPapers = results.data
                  .filter(paper => paper && (paper.title || paper.id)) // Filter out invalid entries
                  .map((paper, index) => {
                    // Generate stable random embeddings
                    const seededRandom = (seed) => {
                      let m = 2**35 - 31;
                      let a = 185852;
                      let s = seed % m;
                      return function() {
                        return (s = s * a % m) / m;
                      };
                    };
                    
                    const rand = seededRandom(index * 1000); // Seed based on index
                    const embedding = Array.from({ length: 50 }, () => rand() * 2 - 1);
                    
                    return {
                      id: paper.id || `paper-${index}`,
                      title: paper.title || `Paper ${index}`,
                      authors: paper.authors || 'Unknown Authors',
                      abstract: paper.abstract || 'No abstract available',
                      venue: paper.venue || paper.conference || 'Unknown Venue',
                      year: paper.year || new Date().getFullYear(),
                      type: paper.type || 'Research Paper',
                      link: paper.url || paper.link || `#paper-${index}`,
                      embedding: embedding,
                      score: 0,
                      cluster: null
                    };
                  });
                
                console.log(`Loaded ${processedPapers.length} papers from CSV`);
                setPapers(processedPapers);
                setSearchResults(processedPapers);
                setIsLoading(false);
              },
              error: (error) => {
                console.error('CSV parsing error:', error);
                throw new Error(`Failed to parse CSV: ${error.message}`);
              }
            });
            return; // Exit early if successfully loaded CSV
          } catch (error) {
            console.error('Error loading real data, falling back to mock data:', error);
            throw error; // Propagate to outer catch
          }
        } catch (error) {
          console.log('Generating mock data as fallback');
          // Generate mock data if CSV loading fails
          const mockPapers = generateMockData(500);
          setPapers(mockPapers);
          setSearchResults(mockPapers);
          setIsLoading(false);
        }
      } catch (error) {
        console.error('Failed to load papers:', error);
        setError(`Failed to load papers: ${error.message}`);
        
        // Generate mock data as ultimate fallback
        const mockPapers = generateMockData(500);
        setPapers(mockPapers);
        setSearchResults(mockPapers);
        setIsLoading(false);
      }
    };
    
    loadPapers();
    
    // Efficiently handle window resize with throttling
    const updateDimensions = _.throttle(() => {
      if (containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        setDimensions({ 
          width: Math.max(width, 300), 
          height: Math.max(height, 500) 
        });
      }
    }, 200); // Throttle to avoid excessive re-renders
    
    window.addEventListener('resize', updateDimensions);
    
    // Initial dimension setup with a slight delay to ensure container is rendered
    setTimeout(updateDimensions, 100);
    
    return () => {
      window.removeEventListener('resize', updateDimensions);
      // Clean up any D3 simulation
      if (visualizationRef.current.simulation) {
        visualizationRef.current.simulation.stop();
      }
    };
  }, [generateMockData]);

  // Memoized similarity calculation function for better performance
  const calculateSimilarity = useCallback((query, paper) => {
    if (!query) return 0.0;
    
    const queryTerms = query.toLowerCase().split(/\s+/);
    const paperText = `${paper.title} ${paper.abstract} ${paper.authors} ${paper.type}`.toLowerCase();
    
    // Calculate term frequency with optimized method
    let matchCount = 0;
    const termCounts = {};
    
    // Count all terms at once for efficiency
    queryTerms.forEach(term => {
      if (term.length > 2) {
        if (!termCounts[term]) {
          const regex = new RegExp(term, 'gi');
          const matches = paperText.match(regex);
          termCounts[term] = matches ? matches.length : 0;
          matchCount += termCounts[term];
          
          // Boost score for title matches
          if (paper.title.toLowerCase().includes(term)) {
            matchCount += 3;
          }
        }
      }
    });
    
    // Stable scoring based on paper ID and query
    const paperIdHash = parseInt(paper.id.split('-').pop() || '0', 10);
    const queryHash = query.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const stableFactor = (Math.sin(paperIdHash * 0.1 + queryHash * 0.01) * 0.2);
    
    // Normalize score between -0.6 and 0.6
    return Math.min(0.6, (matchCount / (queryTerms.length * 3 || 1)) * 1.2) + stableFactor;
  }, []);

  // Optimized search handler with debounce to prevent excessive calculations
  const debouncedSearch = useMemo(() => 
    _.debounce((query, papers, calculateSimilarity) => {
      if (!query.trim()) {
        // Show all papers with stable scores
        const results = papers.map(paper => {
          const idHash = parseInt(paper.id.split('-').pop() || '0', 10);
          const stableScore = (Math.sin(idHash * 0.1) * 1.2) - 0.6;
          return { ...paper, score: stableScore, cluster: null };
        });
        
        setSearchResults(results);
        
        // Reset computation state when search changes
        setComputeState(prev => ({
          ...prev,
          umapComputed: false,
          clusteringComputed: false
        }));
        return;
      }
      
      // Calculate similarity scores and sort results with optimized approach
      const results = papers.map(paper => {
        const score = calculateSimilarity(query, paper);
        return { ...paper, score, cluster: null };
      })
      .sort((a, b) => b.score - a.score);
      
      setSearchResults(results);
      
      // Select the top result
      if (results.length > 0) {
        setSelectedPaper(results[0]);
      } else {
        setSelectedPaper(null);
      }
      
      // Reset computation state when search changes
      setComputeState(prev => ({
        ...prev,
        umapComputed: false,
        clusteringComputed: false
      }));
    }, 300),
    []
  );

  // Handle search form submission
  const handleSearch = useCallback((e) => {
    if (e) e.preventDefault();
    debouncedSearch(searchQuery, papers, calculateSimilarity);
  }, [searchQuery, papers, calculateSimilarity, debouncedSearch]);

  // Progressive UMAP computation with visual feedback
  const runUMAP = useCallback(() => {
    if (!searchResults.length || computeState.umapComputed || computeState.isComputing) return;
    
    try {
      setComputeState(prev => ({ 
        ...prev, 
        isComputing: true, 
        computingTask: 'UMAP', 
        progress: 0 
      }));
      
      // Implement progressive computation using setTimeout to avoid blocking the UI
      const computeUMAP = async () => {
        console.log("Computing UMAP projection");
        
        // Extract embeddings for dimensionality reduction
        const embeddings = searchResults.map(paper => paper.embedding);
        
        // Configure UMAP with enhanced parameters for better spread
        const umap = new UMAP.UMAP({
          nComponents: 2,
          nNeighbors: Math.min(15, searchResults.length - 1),
          minDist: 0.5,
          spread: 1.2, // Increased spread for better visualization
          repulsionStrength: 1.0,
          negativeSampleRate: 5
        });
        
        // Show progressive loading steps
        for (let i = 0; i < 4; i++) {
          await new Promise(resolve => setTimeout(resolve, 100));
          setComputeState(prev => ({ ...prev, progress: (i + 1) * 20 }));
        }
        
        // Perform dimensionality reduction with UMAP in a separate promise to avoid UI freeze
        const result = await new Promise(resolve => {
          // Use setTimeout to move computation off the main thread
          setTimeout(() => {
            const computed = umap.fit(embeddings);
            resolve(computed);
          }, 10);
        });
        
        setUmapResult(result);
        setComputeState(prev => ({ 
          ...prev, 
          umapComputed: true, 
          isComputing: false, 
          computingTask: null, 
          progress: 100 
        }));
      };
      
      computeUMAP();
      
    } catch (error) {
      console.error('UMAP error:', error);
      setError(`UMAP error: ${error.message}`);
      setComputeState(prev => ({ 
        ...prev, 
        isComputing: false, 
        computingTask: null 
      }));
    }
  }, [searchResults, computeState.umapComputed, computeState.isComputing]);
  
  // Optimized K-means clustering implementation with progress tracking
  const runKMeansClustering = useCallback(() => {
    if (!searchResults.length || !computeClusters || !umapResult || 
        computeState.clusteringComputed || computeState.isComputing) return;
    
    try {
      setComputeState(prev => ({ 
        ...prev, 
        isComputing: true, 
        computingTask: 'Clustering', 
        progress: 0 
      }));
      
      // Run clustering in a non-blocking way
      const computeClustering = async () => {
        console.log("Computing K-means clusters");
        
        // Extract embeddings for clustering
        const embeddings = searchResults.map(paper => paper.embedding);
        
        // Show progressive loading steps
        for (let i = 0; i < 4; i++) {
          await new Promise(resolve => setTimeout(resolve, 50));
          setComputeState(prev => ({ ...prev, progress: (i + 1) * 20 }));
        }
        
        // Run K-means clustering with proper parameters in a separate promise
        const clusterResult = await new Promise(resolve => {
          setTimeout(() => {
            const result = kmeans(embeddings, maxClusters, {
              seed: 42, // Fixed seed for consistent results
              initialization: 'kmeans++',
              maxIterations: 100
            });
            resolve(result);
          }, 10);
        });
        
        // Update search results with cluster assignments
        const updatedResults = searchResults.map((paper, index) => ({
          ...paper,
          cluster: index < clusterResult.clusters.length ? clusterResult.clusters[index] : null
        }));
        
        setSearchResults(updatedResults);
        setComputeState(prev => ({ 
          ...prev, 
          clusteringComputed: true, 
          isComputing: false, 
          computingTask: null, 
          progress: 100
        }));
      };
      
      computeClustering();
      
    } catch (error) {
      console.error('Clustering error:', error);
      setError(`Clustering error: ${error.message}`);
      setComputeState(prev => ({ 
        ...prev, 
        isComputing: false, 
        computingTask: null 
      }));
    }
  }, [searchResults, computeClusters, maxClusters, umapResult, 
       computeState.clusteringComputed, computeState.isComputing]);

  // Run UMAP when search results change and it hasn't been computed yet
  useEffect(() => {
    if (searchResults.length > 0 && !computeState.umapComputed && !computeState.isComputing) {
      runUMAP();
    }
  }, [searchResults, computeState.umapComputed, computeState.isComputing, runUMAP]);
  
  // Run clustering when UMAP is done and clustering is enabled
  useEffect(() => {
    if (computeClusters && searchResults.length > 0 && umapResult && 
        computeState.umapComputed && !computeState.clusteringComputed && !computeState.isComputing) {
      runKMeansClustering();
    }
  }, [computeClusters, searchResults.length, umapResult, 
       computeState.umapComputed, computeState.clusteringComputed, 
       computeState.isComputing, runKMeansClustering]);

  // Trigger initial search when papers are loaded
  useEffect(() => {
    if (papers.length > 0 && !isLoading && !searchQuery) {
      handleSearch();
    }
  }, [papers, isLoading, searchQuery, handleSearch]);
  
  // Optimized D3 visualization with smooth transitions and responsive updates
  const visualizeResults = useCallback(() => {
    if (!svgRef.current || searchResults.length === 0 || !dimensions.width || !umapResult) {
      return;
    }
    
    try {
      const svg = d3.select(svgRef.current)
        .attr('width', dimensions.width)
        .attr('height', dimensions.height);
      
      // Clear previous visualization only if not initialized
      if (!visualizationRef.current.isInitialized) {
        svg.selectAll('*').remove();
        
        // Create main visualization groups
        svg.append('g').attr('class', 'points-container');
        svg.append('g').attr('class', 'legend-container')
          .attr('transform', `translate(${dimensions.width - 70}, ${(dimensions.height - 200) / 2})`);
        
        // Create zoom behavior
        const zoom = d3.zoom()
          .scaleExtent([0.5, 5])
          .on('zoom', (event) => {
            svg.select('.points-container').attr('transform', event.transform);
          });
        
        svg.call(zoom);
        visualizationRef.current.zoomBehavior = zoom;
        
        // Add double-click to reset zoom
        svg.on('dblclick', () => {
          svg.transition().duration(750).call(zoom.transform, d3.zoomIdentity);
        });
        
        visualizationRef.current.isInitialized = true;
      }
      
      // Set up scales for X and Y axes with the UMAP result
      const xExtent = d3.extent(umapResult, d => d[0]);
      const yExtent = d3.extent(umapResult, d => d[1]);
      
      const padding = 50;
      
      const xScale = d3.scaleLinear()
        .domain([
          xExtent[0] - (xExtent[1] - xExtent[0]) * 0.1, 
          xExtent[1] + (xExtent[1] - xExtent[0]) * 0.1
        ])
        .range([padding, dimensions.width - padding]);
      
      const yScale = d3.scaleLinear()
        .domain([
          yExtent[0] - (yExtent[1] - yExtent[0]) * 0.1, 
          yExtent[1] + (yExtent[1] - yExtent[0]) * 0.1
        ])
        .range([dimensions.height - padding, padding]);
      
      // Define color scales based on the selected options
      let colorScale;
      if (colorBy === 'cluster' && computeClusters) {
        // For cluster coloring, use a categorical color scale
        const clusterValues = [...new Set(searchResults.map(d => d.cluster).filter(c => c !== null))];
        colorScale = d3.scaleOrdinal()
          .domain(clusterValues)
          .range(d3.schemeCategory10);
      } else {
        // Improved color scale for scores
        const colorRange = colorScheme === 'diverging' 
          ? ['#7a5c55', '#b3a296', '#FFFFFF', '#a3c8c9', '#5d9ca0']
          : colorScheme === 'sequential'
            ? ['#f7fbff', '#deebf7', '#c6dbef', '#9ecae1', '#6baed6', '#4292c6', '#2171b5', '#08519c']
            : ['#7a5c55', '#b3a296', '#FFFFFF', '#a3c8c9', '#5d9ca0']; // Default
        
        colorScale = d3.scaleLinear()
          .domain([-0.8, -0.4, 0.0, 0.4, 0.8])
          .range(colorRange)
          .clamp(true);
      }
      
      // Point size based on data density
      const POINT_SIZE = Math.max(3, Math.min(5, 10 * (500 / searchResults.length)));
      
      // Update score color gradient legend
      const legendG = svg.select('.legend-container');
      legendG.selectAll('*').remove(); // Clear existing legend
      
      // Title
      legendG.append('text')
        .attr('x', 0)
        .attr('y', -20)
        .text(colorBy === 'cluster' ? 'cluster' : 'score')
        .style('font-weight', 'bold')
        .style('text-anchor', 'middle')
        .style('font-size', '12px');
      
      if (colorBy === 'cluster' && computeClusters) {
        // Cluster legend
        const clusterValues = [...new Set(searchResults.map(d => d.cluster).filter(c => c !== null))].sort((a, b) => a - b);
        
        clusterValues.forEach((cluster, i) => {
          legendG.append('circle')
            .attr('cx', 0)
            .attr('cy', i * 20)
            .attr('r', 6)
            .attr('fill', colorScale(cluster));
            
          legendG.append('text')
            .attr('x', 15)
            .attr('y', i * 20 + 4)
            .text(cluster)
            .style('font-size', '10px')
            .style('alignment-baseline', 'middle');
        });
      } else {
        // Score gradient legend
        const gradientHeight = 200;
        const gradientWidth = 30;
        
        // Create gradient
        const defs = svg.select('defs');
        if (defs.empty()) {
          svg.append('defs');
        }
        
        const gradientId = 'score-gradient-' + Date.now(); // Unique ID to avoid conflicts
        const gradient = svg.select('defs').append('linearGradient')
          .attr('id', gradientId)
          .attr('x1', '0%')
          .attr('y1', '100%')
          .attr('x2', '0%')
          .attr('y2', '0%');
        
        // Add gradient stops
        const stops = [
          { offset: '0%', color: colorScale(-0.6) },
          { offset: '25%', color: colorScale(-0.3) },
          { offset: '50%', color: colorScale(0.0) },
          { offset: '75%', color: colorScale(0.3) },
          { offset: '100%', color: colorScale(0.6) }
        ];
        
        stops.forEach(stop => {
          gradient.append('stop')
            .attr('offset', stop.offset)
            .attr('stop-color', stop.color);
        });
        
        // Draw gradient rectangle
        legendG.append('rect')
          .attr('width', gradientWidth)
          .attr('height', gradientHeight)
          .style('fill', `url(#${gradientId})`);
        
        // Add scale ticks
        const ticks = [-0.6, -0.3, 0.0, 0.3, 0.6];
        ticks.forEach(tick => {
          const y = gradientHeight * (1 - ((tick + 0.6) / 1.2));
          
          legendG.append('line')
            .attr('x1', gradientWidth)
            .attr('y1', y)
            .attr('x2', gradientWidth + 5)
            .attr('y2', y)
            .style('stroke', 'black')
            .style('stroke-width', 1);
          
          legendG.append('text')
            .attr('x', gradientWidth + 10)
            .attr('y', y + 4)
            .text(tick.toFixed(1))
            .style('font-size', '10px')
            .style('alignment-baseline', 'middle');
        });
      }
      
      // Make sure tooltip exists
      let tooltip = d3.select('body').select('.tooltip');
      if (tooltip.empty()) {
        tooltip = d3.select('body').append('div')
          .attr('class', 'tooltip')
          .style('opacity', 0)
          .style('position', 'absolute')
          .style('background-color', 'white')
          .style('border', 'solid')
          .style('border-width', '1px')
          .style('border-radius', '5px')
          .style('padding', '10px')
          .style('pointer-events', 'none')
          .style('z-index', '10')
          .style('transition', 'opacity 0.2s');
      }
      
      // Get points container
      const pointsG = svg.select('.points-container');
      
      // Prepare data with positions
      const nodesData = searchResults.map((paper, i) => {
        // Add small amount of stable jitter for better visualization
        const idHash = parseInt(paper.id.split('-').pop() || '0', 10);
        const jitter = {
          x: Math.sin(idHash * 0.1) * 15,
          y: Math.cos(idHash * 0.1) * 15
        };
        
        return {
          ...paper,
          x: xScale(umapResult[i][0]) + jitter.x,
          y: yScale(umapResult[i][1]) + jitter.y
        };
      });
      
      // Store for force simulation if needed
      visualizationRef.current.nodesData = nodesData;
      
      // Optimized D3 enter/update/exit pattern
      // Join data to circles using the paper id as the key
      const circles = pointsG.selectAll('circle')
        .data(nodesData, d => d.id);
      
      // ENTER selection: new circles
      const enterCircles = circles.enter()
        .append('circle')
        .attr('r', 0) // Start small for animation
        .attr('cx', d => d.x)
        .attr('cy', d => d.y)
        .style('opacity', 0)
        .attr('stroke', 'none')
        .attr('stroke-width', 0);
      
      // ENTER + UPDATE selection: all circles
      enterCircles.merge(circles)
        .transition()
        .duration(750)
        .attr('r', POINT_SIZE)
        .attr('cx', d => d.x)
        .attr('cy', d => d.y)
        .attr('fill', d => {
          if (colorBy === 'cluster' && computeClusters) {
            return d.cluster !== null ? colorScale(d.cluster) : '#cccccc';
          } else {
            return colorScale(d.score);
          }
        })
        .attr('stroke', d => selectedPaper && d.id === selectedPaper.id ? '#ff6600' : 'none')
        .attr('stroke-width', d => selectedPaper && d.id === selectedPaper.id ? 2 : 0)
        .style('opacity', 1)
        .style('cursor', 'pointer');
      
      // EXIT selection: circles to remove
      circles.exit()
        .transition()
        .duration(750)
        .attr('r', 0)
        .style('opacity', 0)
        .remove();
      
      // Update event handlers for all circles
      pointsG.selectAll('circle')
        .on('click', (event, d) => {
          setSelectedPaper(d);
        })
        .on('mouseover', function(event, d) {
          // Highlight circle
          d3.select(this)
            .transition()
            .duration(100)
            .attr('stroke-width', 2)
            .attr('stroke', '#ff6600');
          
          // Show tooltip with paper info
          tooltip
            .transition()
            .duration(200)
            .style('opacity', 0.9);
            
          // Format the tooltip content
          const tooltipContent = `
            <strong>${d.title}</strong><br/>
            ${d.authors}<br/>
            ${d.year}${d.cluster !== null ? `<br/>Cluster: ${d.cluster}` : ''}
            ${d.score !== undefined ? `<br/>Score: ${d.score.toFixed(2)}` : ''}
          `;
          
          tooltip.html(tooltipContent)
            .style('left', (event.pageX + 10) + 'px')
            .style('top', (event.pageY - 28) + 'px');
        })
        .on('mouseout', function(event, d) {
          // Reset circle highlight
          d3.select(this)
            .transition()
            .duration(100)
            .attr('stroke-width', selectedPaper && d.id === selectedPaper.id ? 2 : 0)
            .attr('stroke', selectedPaper && d.id === selectedPaper.id ? '#ff6600' : 'none');
          
          // Hide tooltip
          tooltip.transition()
            .duration(200)
            .style('opacity', 0);
        });
      
      // Display results count and status
      svg.selectAll('.status-text').remove();
      svg.append('text')
        .attr('class', 'status-text')
        .attr('x', 10)
        .attr('y', 20)
        .text(`${searchResults.length} results found. ${computeClusters && computeState.clusteringComputed ? `Clustered into ${maxClusters} groups. ` : ''}Click on a point to view paper details.`)
        .style('font-size', '14px')
        .style('fill', '#333');

      // Add zoom controls
      if (!svg.select('.zoom-controls').size()) {
        const zoomControls = svg.append('g')
          .attr('class', 'zoom-controls')
          .attr('transform', `translate(${dimensions.width - 40}, 30)`);
        
        // Zoom in button
        const zoomInBtn = zoomControls.append('g')
          .attr('class', 'zoom-btn')
          .style('cursor', 'pointer');
        
        zoomInBtn.append('circle')
          .attr('r', 15)
          .attr('fill', '#ffffff')
          .attr('stroke', '#cccccc');
        
        zoomInBtn.append('text')
          .attr('x', 0)
          .attr('y', 5)
          .attr('text-anchor', 'middle')
          .text('+')
          .style('font-size', '20px')
          .style('fill', '#333333');
        
        // Zoom out button
        const zoomOutBtn = zoomControls.append('g')
          .attr('class', 'zoom-btn')
          .attr('transform', 'translate(0, 40)')
          .style('cursor', 'pointer');
        
        zoomOutBtn.append('circle')
          .attr('r', 15)
          .attr('fill', '#ffffff')
          .attr('stroke', '#cccccc');
        
        zoomOutBtn.append('text')
          .attr('x', 0)
          .attr('y', 5)
          .attr('text-anchor', 'middle')
          .text('-')
          .style('font-size', '20px')
          .style('fill', '#333333');
        
        // Add zoom functionality
        zoomInBtn.on('click', () => {
          svg.transition().duration(300).call(
            visualizationRef.current.zoomBehavior.scaleBy, 1.3
          );
        });
        
        zoomOutBtn.on('click', () => {
          svg.transition().duration(300).call(
            visualizationRef.current.zoomBehavior.scaleBy, 0.7
          );
        });
      }

    } catch (error) {
      console.error('Visualization error:', error);
      setError(`Visualization error: ${error.message}`);
    }
  }, [searchResults, dimensions, selectedPaper, computeClusters, colorBy, colorScheme, umapResult, computeState.clusteringComputed, maxClusters]);


  // Update visualization when data or dimensions change
  useEffect(() => {
    if (!isLoading && umapResult && !computeState.isComputing) {
      visualizeResults();
    }
  }, [isLoading, visualizeResults, umapResult, computeState.isComputing]);

  // Reset clusters when computeClusters changes
  useEffect(() => {
    if (!computeClusters) {
      // Clear cluster assignments
      setSearchResults(prev => prev.map(paper => ({ ...paper, cluster: null })));
      setComputeState(prev => ({ ...prev, clusteringComputed: false }));
    } else if (computeClusters && umapResult && computeState.umapComputed && !computeState.clusteringComputed && !computeState.isComputing) {
      // Recompute clusters if enabled
      runKMeansClustering();
    }
  }, [computeClusters, umapResult, computeState.umapComputed, computeState.clusteringComputed, computeState.isComputing, runKMeansClustering]);

  // Render top search results with optimized UI
  const renderTopResults = () => {
    if (searchResults.length === 0) {
      return <p>No results found. Try a different search query.</p>;
    }
    
    // Show only top papers
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        {searchResults.slice(0, 8).map(paper => (
          <div 
            key={paper.id}
            className={`p-4 border rounded cursor-pointer transition-all ${
              selectedPaper && selectedPaper.id === paper.id 
                ? 'border-blue-500 bg-blue-50' 
                : 'hover:border-blue-300'
            }`}
            onClick={() => setSelectedPaper(paper)}
          >
            <h3 className="font-medium text-base">{paper.title}</h3>
            <p className="text-sm text-gray-600 mt-1">{paper.authors}</p>
            <div className="flex flex-wrap justify-between text-xs text-gray-500 mt-2">
              <span>{paper.year}</span>
              <span>Score: {paper.score.toFixed(2)}</span>
              {paper.cluster !== null && (
                <span>Cluster: {paper.cluster}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // Render loading progress for computations
  const renderComputeProgress = () => {
    if (!computeState.isComputing) return null;
    
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-20 z-50" style={{ pointerEvents: 'none' }}>
        <div className="bg-white p-4 rounded shadow-lg max-w-sm w-full">
          <p className="font-medium mb-2">
            {computeState.computingTask === 'UMAP' ? 'Computing dimension reduction...' : 
             computeState.computingTask === 'Clustering' ? 'Computing clusters...' : 
             'Processing...'}
          </p>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div 
              className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" 
              style={{ width: `${computeState.progress}%` }}
            ></div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold text-center mb-6">Academic Paper Search</h1>
      
      {/* Search Form with better UX */}
      <form onSubmit={handleSearch} className="mb-6">
        <div className="search-container flex">
          <input
            type="text"
            placeholder="Search papers by title, author, or content..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input flex-grow rounded-l p-2 border-2 border-r-0 border-gray-300 focus:border-blue-500 focus:outline-none"
          />
          <button 
            type="submit" 
            className="search-button bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-r transition-colors"
            onClick={handleSearch}
          >
            Search
          </button>
        </div>
      </form>
      
      {/* Tab Navigation with improved UI */}
      <div className="tabs mb-6">
        <div className="tabs-list flex border-b">
          <button 
            className={`tab-trigger px-4 py-2 font-medium mr-2 ${activeTab === 'visualization' ? 'text-blue-800 border-b-2 border-blue-800' : 'text-gray-500'}`}
            onClick={() => setActiveTab('visualization')}
          >
            Visualization
          </button>
          <button 
            className={`tab-trigger px-4 py-2 font-medium ${activeTab === 'details' ? 'text-blue-800 border-b-2 border-blue-800' : 'text-gray-500'}`}
            onClick={() => setActiveTab('details')}
          >
            Paper Details
          </button>
        </div>
      </div>
      
      {/* Visualization Controls with better layout */}
      <div className="bg-white rounded shadow p-4 mb-6">
        <h2 className="text-lg font-semibold mb-3">Visualization Options</h2>
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex items-center">
            <input
              type="checkbox"
              id="compute-clusters"
              checked={computeClusters}
              onChange={(e) => setComputeClusters(e.target.checked)}
              className="mr-2"
            />
            <label htmlFor="compute-clusters">Enable Clustering (K-means, K=12)</label>
          </div>
          
          <div className="flex items-center">
            <label htmlFor="color-by" className="mr-2">Color by:</label>
            <select
              id="color-by"
              value={colorBy}
              onChange={(e) => setColorBy(e.target.value)}
              className="p-1 border rounded"
            >
              <option value="score">Relevance Score</option>
              <option value="cluster">Cluster</option>
            </select>
          </div>
          
          <div className="flex items-center">
            <label htmlFor="color-scheme" className="mr-2">Color scheme:</label>
            <select
              id="color-scheme"
              value={colorScheme}
              onChange={(e) => setColorScheme(e.target.value)}
              className="p-1 border rounded"
            >
              <option value="categorical">Categorical</option>
              <option value="diverging">Diverging (Brown-Blue)</option>
              <option value="sequential">Sequential (Blues)</option>
            </select>
          </div>
        </div>
      </div>
      
      {/* Error Handling with better UI */}
      {error && (
        <div className="bg-red-100 text-red-800 p-3 rounded mb-4 flex items-start">
          <svg className="w-5 h-5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          <span>{error}</span>
          <button 
            className="ml-auto text-red-700 hover:text-red-900 focus:outline-none"
            onClick={() => setError(null)}
          >
            ✕
          </button>
        </div>
      )}
      
      {/* Loading State with smoother animation */}
      {isLoading ? (
        <div className="text-center p-8">
          <div className="inline-block h-8 w-8 border-4 border-t-blue-500 rounded-full animate-spin"></div>
          <p className="mt-2">Loading papers and preparing visualization...</p>
        </div>
      ) : (
        <div className="flex flex-col md:flex-row gap-6">
          {/* Main Content Area */}
          {activeTab === 'visualization' && (
            <div className="w-full bg-white rounded shadow p-4">
              <div className="card-header pb-4 border-b">
                <h2 className="text-lg font-semibold">Paper Network Visualization</h2>
                <p className="text-sm text-gray-600">Papers grouped by similarity and relevance</p>
              </div>
              <div className="visualization-container pt-4" ref={containerRef}>
                <svg 
                  ref={svgRef} 
                  className="w-full border border-gray-200 rounded"
                  style={{ height: dimensions.height + 'px' }}
                ></svg>
                
                {/* Show computation state when no results yet */}
                {(!umapResult && !isLoading) && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center p-4">
                      {computeState.isComputing ? (
                        <>
                          <div className="inline-block h-6 w-6 border-2 border-t-blue-500 rounded-full animate-spin mb-2"></div>
                          <p>{computeState.computingTask === 'UMAP' ? 'Computing dimensions...' : 'Processing...'}</p>
                        </>
                      ) : (
                        <p>No visualization data available. Try a search query.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          
          {activeTab === 'details' && (
            <div className="flex flex-col md:flex-row gap-6 w-full">
              {/* Paper Details */}
              <div className="md:w-2/3 bg-white rounded shadow p-4">
                <div className="card-header pb-4 border-b">
                  <h2 className="text-lg font-semibold">Paper Details</h2>
                  <p className="text-sm text-gray-600">
                    {selectedPaper ? `Details for "${selectedPaper.title}"` : 'Select a paper to view details'}
                  </p>
                </div>
                <div className="card-content pt-4">
                  {selectedPaper ? (
                    <div className="paper-details">
                      <h3 className="text-xl font-medium mb-2">{selectedPaper.title}</h3>
                      <p className="text-base text-gray-600 mb-2">{selectedPaper.authors}</p>
                      <div className="flex flex-wrap items-center gap-2 mb-4">
                        <span className="badge badge-outline px-2 py-1 rounded text-xs border">{selectedPaper.venue}</span>
                        <span className="badge badge-outline px-2 py-1 rounded text-xs border">{selectedPaper.year}</span>
                        <span className="badge badge-outline px-2 py-1 rounded text-xs border">{selectedPaper.type}</span>
                        {selectedPaper.cluster !== null && (
                          <span className="badge badge-outline px-2 py-1 rounded text-xs border bg-blue-50">Cluster: {selectedPaper.cluster}</span>
                        )}
                      </div>
                      
                      <div className="mb-4">
                        <h4 className="text-lg font-medium mb-2">Abstract</h4>
                        <p className="text-base">{selectedPaper.abstract}</p>
                      </div>
                      
                      <div className="mb-4">
                        <h4 className="text-lg font-medium mb-2">Relevance</h4>
                        <p className="text-base">Score: <span className="font-medium">{selectedPaper.score.toFixed(2)}</span></p>
                        <div className="w-full h-2 bg-gray-200 rounded-full mt-1 overflow-hidden">
                          <div 
                            className={`h-full rounded-full ${selectedPaper.score >= 0 ? 'bg-blue-500' : 'bg-gray-400'}`}
                            style={{ 
                              width: `${Math.abs(selectedPaper.score) * 100 / 0.6}%`,
                              marginLeft: selectedPaper.score < 0 ? `${(0.6 + selectedPaper.score) * 100 / 0.6}%` : '50%'
                            }}
                          ></div>
                        </div>
                        <div className="flex justify-between text-xs text-gray-600 mt-1">
                          
                        </div>
                      </div>
                      
                      <div className="flex gap-2">
                        <a 
                          href={selectedPaper.link || "#"} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="btn btn-primary bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded transition-colors"
                        >
                          Read Full Paper
                        </a>
                        <button className="btn btn-outline border hover:bg-gray-50 px-4 py-2 rounded transition-colors">
                          Cite
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <p>Select a paper from the visualization to view details</p>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Top Results Panel */}
              <div className="md:w-1/3 bg-white rounded shadow p-4">
                <div className="card-header pb-4 border-b">
                  <h2 className="text-lg font-semibold">Top Results</h2>
                  <p className="text-sm text-gray-600">{searchResults.length} papers found</p>
                </div>
                <div className="card-content pt-4 max-h-[600px] overflow-auto">
                  {renderTopResults()}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Render computation progress overlay */}
      {renderComputeProgress()}
    </div>
  );
};

export default OptimizedAcademicPaperVisualization;