const API_BASE = '';

let currentDatasetId = null;
let currentLineage = null;

document.addEventListener('DOMContentLoaded', () => {
  initializeApp();
  loadDatasets();
});

function initializeApp() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  document.getElementById('uploadBox').addEventListener('click', () => {
    document.getElementById('fileInput').click();
  });

  document.getElementById('uploadBox').addEventListener('dragover', (e) => {
    e.preventDefault();
    e.currentTarget.classList.add('dragover');
  });

  document.getElementById('uploadBox').addEventListener('dragleave', (e) => {
    e.currentTarget.classList.remove('dragover');
  });

  document.getElementById('uploadBox').addEventListener('drop', (e) => {
    e.preventDefault();
    e.currentTarget.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length) uploadFile(files[0]);
  });

  document.getElementById('fileInput').addEventListener('change', (e) => {
    if (e.target.files.length) uploadFile(e.target.files[0]);
  });

  document.getElementById('searchBtn').addEventListener('click', performSearch);
  document.getElementById('searchInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') performSearch();
  });

  document.getElementById('backToSearch').addEventListener('click', () => {
    switchTab('search');
  });

  document.getElementById('exportJson').addEventListener('click', () => exportDataset('json'));
  document.getElementById('exportCsv').addEventListener('click', () => exportDataset('csv'));
}

function switchTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });

  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });

  document.getElementById(`${tabName}-tab`).classList.add('active');

  if (tabName === 'datasets') loadDatasets();
  if (tabName === 'flowlineage') loadCombinedLineage();
}

async function loadCombinedLineage() {
  const container = document.getElementById('flowLineageGraph');
  container.innerHTML = '<p class="placeholder-text">Loading combined lineage...</p>';

  try {
    const response = await fetch(`${API_BASE}/api/combined-lineage`);
    const data = await response.json();

    if (data.nodes.length === 0) {
      container.innerHTML = '<p class="placeholder-text">No data available. Upload AIM and DM mapping files first.</p>';
      return;
    }

    document.getElementById('flowFieldInfo').innerHTML = '<p>Click a node to view details</p>';
    document.getElementById('flowLogicInfo').innerHTML = '';

    renderCombinedGraph(data);
  } catch (error) {
    container.innerHTML = '<p class="placeholder-text">Failed to load lineage data</p>';
  }
}

function renderCombinedGraph(data) {
  const container = document.getElementById('flowLineageGraph');
  container.innerHTML = '';

  const nodeWidth = 200;
  const nodeHeight = 24;
  const nodeSpacing = 30;
  const padding = 20;
  const headerHeight = 50;
  const groupHeaderHeight = 30;

  const srcTableNodes = data.nodes.filter(n => n.type === 'src-table');
  const srcFieldNodes = data.nodes.filter(n => n.type === 'src-field');
  const aimFieldNodes = data.nodes.filter(n => n.type === 'aim-field');
  const dmFieldNodes = data.nodes.filter(n => n.type === 'dm-field');

  const stgGroups = {};
  srcTableNodes.forEach(table => {
    const fields = srcFieldNodes.filter(f => f.table === table.name);
    stgGroups[table.name] = { table, fields, alias: table.alias || '' };
  });

  const aimFields = aimFieldNodes;
  const dmFields = dmFieldNodes;

  const groupSpacing = 15;
  let totalStgHeight = headerHeight;
  Object.values(stgGroups).forEach(group => {
    totalStgHeight += groupHeaderHeight + (group.fields.length * nodeSpacing) + groupSpacing;
  });

  const maxFields = Math.max(aimFields.length, dmFields.length, 
    Object.values(stgGroups).reduce((sum, g) => sum + g.fields.length, 0));
  
  const contentHeight = Math.max(totalStgHeight, headerHeight + (maxFields * nodeSpacing) + 100);
  const totalWidth = nodeWidth * 3 + padding * 5;
  const totalHeight = contentHeight + padding * 2;

  const svg = d3.select(container)
    .append('svg')
    .attr('width', totalWidth)
    .attr('height', totalHeight)
    .style('background', 'white');

  const defs = svg.append('defs');

  defs.append('marker')
    .attr('id', 'flow-arrow')
    .attr('viewBox', '0 0 10 10')
    .attr('refX', 9)
    .attr('refY', 5)
    .attr('markerWidth', 5)
    .attr('markerHeight', 5)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M 0 0 L 10 5 L 0 10 z')
    .attr('fill', '#aaa');

  const laneX = [
    padding,
    nodeWidth + padding * 3,
    nodeWidth * 2 + padding * 5
  ];

  const lanes = [
    { x: laneX[0], color: '#f0f7ff', borderColor: '#b8d4f0', label: 'STAGING', labelColor: '#2c5282' },
    { x: laneX[1], color: '#f0fff4', borderColor: '#b8f0c8', label: 'AIM', labelColor: '#276749' },
    { x: laneX[2], color: '#fff5f5', borderColor: '#f0b8b8', label: 'DM REPORTING', labelColor: '#9b2c2c' }
  ];

  lanes.forEach((lane, i) => {
    svg.append('rect')
      .attr('x', lane.x)
      .attr('y', padding)
      .attr('width', nodeWidth + padding * 2)
      .attr('height', totalHeight - padding * 2)
      .attr('fill', lane.color)
      .attr('stroke', lane.borderColor)
      .attr('stroke-width', 2)
      .attr('rx', 10);

    svg.append('rect')
      .attr('x', lane.x + 10)
      .attr('y', padding + 10)
      .attr('width', nodeWidth + padding)
      .attr('height', 28)
      .attr('fill', lane.borderColor)
      .attr('rx', 5);

    svg.append('text')
      .attr('x', lane.x + (nodeWidth + padding * 2) / 2)
      .attr('y', padding + 29)
      .attr('text-anchor', 'middle')
      .attr('fill', lane.labelColor)
      .attr('font-size', '12px')
      .attr('font-weight', 'bold')
      .text(lane.label);
  });

  const g = svg.append('g');
  const nodePositions = {};

  let stgY = headerHeight + padding;

  Object.entries(stgGroups).forEach(([tableName, group]) => {
    svg.append('rect')
      .attr('x', laneX[0] + 10)
      .attr('y', stgY)
      .attr('width', nodeWidth + padding)
      .attr('height', 22)
      .attr('fill', '#d4e6f1')
      .attr('rx', 4);

    svg.append('text')
      .attr('x', laneX[0] + (nodeWidth + padding * 2) / 2)
      .attr('y', stgY + 15)
      .attr('text-anchor', 'middle')
      .attr('fill', '#2c3e50')
      .attr('font-size', '10px')
      .attr('font-weight', 'bold')
      .text(tableName.length > 25 ? tableName.substring(0, 23) + '...' : tableName);

    stgY += groupHeaderHeight;

    group.fields.forEach((field, i) => {
      const fieldNodeId = `stgfield-${field.table}-${field.name}`;
      const y = stgY + i * nodeSpacing;

      nodePositions[fieldNodeId] = { 
        x: laneX[0] + 20, 
        y: y, 
        width: nodeWidth, 
        height: nodeHeight - 4 
      };

      g.append('rect')
        .attr('x', laneX[0] + 20)
        .attr('y', y)
        .attr('width', nodeWidth)
        .attr('height', nodeHeight - 4)
        .attr('fill', '#fef9e7')
        .attr('stroke', '#f0d28a')
        .attr('stroke-width', 1)
        .attr('rx', 4)
        .attr('class', 'field-node')
        .attr('data-id', fieldNodeId)
        .style('cursor', 'pointer');

      g.append('text')
        .attr('x', laneX[0] + 30)
        .attr('y', y + (nodeHeight - 4) / 2 + 3)
        .attr('fill', '#7d6608')
        .attr('font-size', '9px')
        .text(field.name.length > 22 ? field.name.substring(0, 20) + '...' : field.name);
    });

    stgY += group.fields.length * nodeSpacing + groupSpacing;
  });

  const aimStartY = headerHeight + padding + 40;

  aimFields.forEach((field, i) => {
    const fieldNodeId = `aimfield-${field.table}-${field.name}`;
    const y = aimStartY + i * nodeSpacing;

    nodePositions[fieldNodeId] = { 
      x: laneX[1] + 20, 
      y: y, 
      width: nodeWidth, 
      height: nodeHeight - 4 
    };

    g.append('rect')
      .attr('x', laneX[1] + 20)
      .attr('y', y)
      .attr('width', nodeWidth)
      .attr('height', nodeHeight - 4)
      .attr('fill', '#fef9e7')
      .attr('stroke', '#f0d28a')
      .attr('stroke-width', 1)
      .attr('rx', 4)
      .attr('class', 'field-node')
      .attr('data-id', fieldNodeId)
      .style('cursor', 'pointer');

    g.append('text')
      .attr('x', laneX[1] + 30)
      .attr('y', y + (nodeHeight - 4) / 2 + 3)
      .attr('fill', '#7d6608')
      .attr('font-size', '9px')
      .text(field.name.length > 22 ? field.name.substring(0, 20) + '...' : field.name);
  });

  const dmStartY = headerHeight + padding + 40;

  dmFields.forEach((field, i) => {
    const fieldNodeId = `dmfield-${field.table}-${field.name}`;
    const y = dmStartY + i * nodeSpacing;

    nodePositions[fieldNodeId] = { 
      x: laneX[2] + 20, 
      y: y, 
      width: nodeWidth, 
      height: nodeHeight - 4 
    };

    g.append('rect')
      .attr('x', laneX[2] + 20)
      .attr('y', y)
      .attr('width', nodeWidth)
      .attr('height', nodeHeight - 4)
      .attr('fill', '#fef9e7')
      .attr('stroke', '#f0d28a')
      .attr('stroke-width', 1)
      .attr('rx', 4)
      .attr('class', 'field-node')
      .attr('data-id', fieldNodeId)
      .style('cursor', 'pointer');

    g.append('text')
      .attr('x', laneX[2] + 30)
      .attr('y', y + (nodeHeight - 4) / 2 + 3)
      .attr('fill', '#7d6608')
      .attr('font-size', '9px')
      .text(field.name.length > 22 ? field.name.substring(0, 20) + '...' : field.name);
  });

  data.edges.forEach(edge => {
    const sourcePos = nodePositions[edge.source];
    const targetPos = nodePositions[edge.target];
    
    if (sourcePos && targetPos) {
      const sx = sourcePos.x + sourcePos.width;
      const sy = sourcePos.y + sourcePos.height / 2;
      const tx = targetPos.x;
      const ty = targetPos.y + targetPos.height / 2;

      let strokeColor = '#ccc';
      let strokeWidth = 1;

      if (edge.type === 'mapping') {
        if (edge.layer === 'staging-to-aim') {
          strokeColor = '#85c1e9';
          strokeWidth = 1.5;
        } else if (edge.layer === 'aim-to-dm') {
          strokeColor = '#f1948a';
          strokeWidth = 1.5;
        } else {
          strokeColor = '#d5dbdb';
          strokeWidth = 1;
        }
      }

      const midX = (sx + tx) / 2;
      
      g.append('path')
        .attr('d', `M${sx},${sy} C${midX},${sy} ${midX},${ty} ${tx},${ty}`)
        .attr('stroke', strokeColor)
        .attr('stroke-width', strokeWidth)
        .attr('fill', 'none')
        .attr('marker-end', 'url(#flow-arrow)');
    }
  });

  g.selectAll('.field-node')
    .on('click', function() {
      g.selectAll('.field-node').attr('stroke', '#f0d28a').attr('stroke-width', 1);
      d3.select(this).attr('stroke', '#e67e22').attr('stroke-width', 2);

      const nodeId = d3.select(this).attr('data-id');
      const node = data.nodes.find(n => n.id === nodeId);
      
      if (node) {
        document.getElementById('flowFieldInfo').innerHTML = `
          <p><strong>Field:</strong> ${node.name}</p>
          <p><strong>Table:</strong> ${node.table || 'N/A'}</p>
          ${node.dataType ? `<p><strong>Data Type:</strong> ${node.dataType}</p>` : ''}
          ${node.description ? `<p><strong>Description:</strong> ${node.description}</p>` : ''}
        `;

        const relatedEdges = data.edges.filter(e => e.source === nodeId || e.target === nodeId);
        const mappingEdges = relatedEdges.filter(e => e.type === 'mapping');
        
        if (mappingEdges.length > 0) {
          document.getElementById('flowLogicInfo').innerHTML = mappingEdges.map(e => `
            <div class="logic-item">
              <p><strong>Source:</strong> ${e.source.split('-').slice(1).join('-')}</p>
              <p><strong>Target:</strong> ${e.target.split('-').slice(1).join('-')}</p>
              ${e.logic ? `<div class="logic-code">${e.logic}</div>` : ''}
            </div>
          `).join('');
        } else {
          document.getElementById('flowLogicInfo').innerHTML = '<p>No transformation</p>';
        }
      }
    })
    .on('mouseover', function() {
      d3.select(this).attr('fill', '#fdebd0');
    })
    .on('mouseout', function() {
      d3.select(this).attr('fill', '#fef9e7');
    });
}

async function uploadFile(file) {
  const formData = new FormData();
  formData.append('mappingFile', file);

  const progressContainer = document.getElementById('uploadProgress');
  const progressFill = document.getElementById('progressFill');
  const uploadStatus = document.getElementById('uploadStatus');
  const resultContainer = document.getElementById('uploadResult');
  const resultMessage = document.getElementById('resultMessage');

  progressContainer.classList.remove('hidden');
  resultContainer.classList.add('hidden');

  let progress = 0;
  const progressInterval = setInterval(() => {
    progress = Math.min(progress + 10, 90);
    progressFill.style.width = `${progress}%`;
  }, 100);

  try {
    const response = await fetch(`${API_BASE}/api/upload`, {
      method: 'POST',
      body: formData
    });

    clearInterval(progressInterval);
    progressFill.style.width = '100%';

    const result = await response.json();

    if (response.ok) {
      uploadStatus.textContent = 'Upload complete!';
      const stats = result.stats;
      resultMessage.innerHTML = `
        <div class="upload-stats">
          <p><strong>Destination Table:</strong> ${stats.destinationTable}</p>
          <p><strong>Data Sources:</strong> ${stats.dataSources} tables</p>
          <p><strong>Source Tables:</strong> ${stats.sourceTables} unique tables</p>
          <p><strong>Destination Fields:</strong> ${stats.destinationFields} fields</p>
          <p><strong>Total Mappings:</strong> ${stats.mappings} mappings</p>
        </div>
      `;
      resultContainer.classList.remove('hidden');
      resultContainer.querySelector('.success-message').style.color = '#27ae60';
      currentDatasetId = result.datasetId;
      loadDatasets();
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    clearInterval(progressInterval);
    uploadStatus.textContent = 'Upload failed';
    resultMessage.textContent = error.message;
    resultContainer.classList.remove('hidden');
    resultContainer.querySelector('.success-message').style.color = '#e74c3c';
  }

  setTimeout(() => {
    progressContainer.classList.add('hidden');
  }, 2000);
}

async function loadDatasets() {
  try {
    const response = await fetch(`${API_BASE}/api/datasets`);
    const datasets = await response.json();

    const listContainer = document.getElementById('datasetsList');
    const selectContainer = document.getElementById('searchDataset');

    if (datasets.length === 0) {
      listContainer.innerHTML = '<p class="placeholder-text">No datasets uploaded yet</p>';
      selectContainer.innerHTML = '<option value="">All Datasets</option>';
      return;
    }

    listContainer.innerHTML = datasets.map(ds => `
      <div class="dataset-card" data-id="${ds.id}">
        <div class="dataset-card-header">
          <h4>${ds.name}</h4>
          <button class="btn-delete" data-id="${ds.id}" title="Delete Dataset">×</button>
        </div>
        <p><strong>Version:</strong> ${ds.version}</p>
        <p><strong>Uploaded:</strong> ${new Date(ds.uploadDate).toLocaleDateString()}</p>
        <p><strong>ID:</strong> ${ds.id.substring(0, 8)}...</p>
        <div class="dataset-actions">
          <button class="btn-view" data-id="${ds.id}">View Graph</button>
        </div>
      </div>
    `).join('');

    selectContainer.innerHTML = '<option value="">All Datasets</option>' + 
      datasets.map(ds => `<option value="${ds.id}">${ds.name}</option>`).join('');

    listContainer.querySelectorAll('.btn-view').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        currentDatasetId = btn.dataset.id;
        viewLineage(btn.dataset.id);
      });
    });

    listContainer.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm('Are you sure you want to delete this dataset?')) {
          await deleteDataset(btn.dataset.id);
        }
      });
    });
  } catch (error) {
    console.error('Failed to load datasets:', error);
  }
}

async function deleteDataset(datasetId) {
  try {
    const response = await fetch(`${API_BASE}/api/datasets/${datasetId}`, {
      method: 'DELETE'
    });
    
    if (response.ok) {
      loadDatasets();
    } else {
      alert('Failed to delete dataset');
    }
  } catch (error) {
    console.error('Delete error:', error);
    alert('Failed to delete dataset');
  }
}

async function performSearch() {
  const query = document.getElementById('searchInput').value.trim();
  const datasetId = document.getElementById('searchDataset').value;
  const searchType = document.querySelector('input[name="searchType"]:checked').value;

  if (!query) return;

  const resultsContainer = document.getElementById('searchResults');
  resultsContainer.innerHTML = '<p class="placeholder-text">Searching...</p>';

  try {
    const params = new URLSearchParams({ q: query });
    if (datasetId) params.append('datasetId', datasetId);
    if (searchType !== 'all') params.append('type', searchType);

    const response = await fetch(`${API_BASE}/api/search?${params}`);
    const results = await response.json();

    if (results.destinations.length === 0 && results.sources.length === 0) {
      resultsContainer.innerHTML = '<p class="placeholder-text">No results found</p>';
      return;
    }

    let html = '';

    if (results.destinations.length > 0) {
      html += `<h4 style="margin-bottom: 15px; color: #2c3e50;">Destination Fields (${results.destinations.length})</h4>`;
      results.destinations.forEach(item => {
        const uniqueSources = [...new Set(item.mappings.map(m => m.sourceTable).filter(Boolean))];
        const hasJoin = uniqueSources.length > 1;
        html += `
          <div class="result-item" data-dataset="${item.datasetId}" data-table="${item.tableName}" data-field="${item.fieldName}">
            <div class="result-header">
              <h4>${item.tableName}.${item.fieldName}</h4>
              ${hasJoin ? '<span class="tag tag-join">JOIN</span>' : ''}
            </div>
            <p><span class="tag">Type:</span> ${item.dataType || 'N/A'}</p>
            <p>${item.description || 'No description'}</p>
            <div class="source-list">
              <span class="tag">Sources:</span>
              ${uniqueSources.map(s => `<span class="source-chip">${s}</span>`).join('')}
            </div>
            ${item.mappings[0] ? `<p class="logic-preview"><span class="tag">Logic:</span> ${(item.mappings[0].logic || '').substring(0, 80)}${item.mappings[0].logic && item.mappings[0].logic.length > 80 ? '...' : ''}</p>` : ''}
          </div>
        `;
      });
    }

    if (results.sources.length > 0) {
      html += `<h4 style="margin: 20px 0 15px; color: #2c3e50;">Source Tables (${results.sources.length})</h4>`;
      const grouped = {};
      results.sources.forEach(item => {
        if (!grouped[item.tableName]) grouped[item.tableName] = [];
        grouped[item.tableName].push(item.fieldName);
      });
      Object.keys(grouped).forEach(table => {
        html += `
          <div class="result-item source-table-item" data-dataset="${results.sources[0].datasetId}" data-table="${table}">
            <h4>${table}</h4>
            <p class="source-fields">${grouped[table].slice(0, 5).join(', ')}${grouped[table].length > 5 ? ` ... +${grouped[table].length - 5} more` : ''}</p>
          </div>
        `;
      });
    }

    resultsContainer.innerHTML = html;

    resultsContainer.querySelectorAll('.result-item').forEach(item => {
      item.addEventListener('click', () => {
        const { dataset, table, field } = item.dataset;
        viewLineage(dataset, table, field);
      });
    });
  } catch (error) {
    resultsContainer.innerHTML = '<p class="placeholder-text" style="color: #e74c3c;">Search failed</p>';
  }
}

async function viewLineage(datasetId, tableName, fieldName) {
  switchTab('lineage');

  if (tableName && fieldName) {
    await loadFieldLineage(datasetId, tableName, fieldName);
  } else {
    await loadDatasetGraph(datasetId);
  }
}

async function loadFieldLineage(datasetId, tableName, fieldName) {
  try {
    const response = await fetch(`${API_BASE}/api/lineage/${datasetId}/${tableName}/${fieldName}`);
    currentLineage = await response.json();

    document.getElementById('lineageTitle').textContent = `${tableName}.${fieldName} Lineage`;
    
    displayDataFlowSummary(currentLineage);
    displayLineageDetails(currentLineage);
    renderLineageGraph(currentLineage);
  } catch (error) {
    console.error('Failed to load lineage:', error);
  }
}

async function loadDatasetGraph(datasetId) {
  try {
    const response = await fetch(`${API_BASE}/api/graph/${datasetId}`);
    const graphData = await response.json();

    document.getElementById('lineageTitle').textContent = 'Dataset Graph View';
    document.getElementById('fieldInfo').innerHTML = '<p>Select a node to view details</p>';
    document.getElementById('logicInfo').innerHTML = '';
    document.getElementById('joinInfo').innerHTML = '';

    const summary = document.getElementById('dataFlowSummary');
    summary.style.display = 'block';
    document.getElementById('flowContent').innerHTML = `
      <div class="flow-stats">
        <span><strong>${graphData.nodes.filter(n => n.type === 'source').length}</strong> Source Tables</span>
        <span><strong>${graphData.nodes.filter(n => n.type === 'field').length}</strong> Fields</span>
        <span><strong>${graphData.edges.length}</strong> Connections</span>
      </div>
    `;

    renderFullGraph(graphData);
  } catch (error) {
    console.error('Failed to load graph:', error);
  }
}

function displayDataFlowSummary(lineage) {
  const summary = document.getElementById('dataFlowSummary');
  const flowContent = document.getElementById('flowContent');

  if (!lineage.field || lineage.upstream.length === 0) {
    summary.style.display = 'none';
    return;
  }

  summary.style.display = 'block';

  const groupedSources = {};
  lineage.upstream.forEach(u => {
    if (!groupedSources[u.table]) {
      groupedSources[u.table] = [];
    }
    groupedSources[u.table].push(u.field);
  });

  let flowHtml = '';
  const sourceTables = Object.keys(groupedSources);

  sourceTables.forEach((table, idx) => {
    const fields = groupedSources[table];
    flowHtml += `
      <div class="flow-row">
        <span class="flow-node flow-source">${table}</span>
        <span class="flow-arrow">→</span>
        <span class="flow-node flow-source" style="font-size:0.8rem; padding: 5px 10px;">${fields.join(', ')}</span>
        <span class="flow-arrow">→</span>
        <span class="flow-node flow-transform">${(lineage.upstream[0].logic || '').substring(0, 50)}...</span>
        <span class="flow-arrow">→</span>
        <span class="flow-node flow-dest">${lineage.field.name}</span>
      </div>
    `;
  });

  if (sourceTables.length === 0) {
    flowHtml = `
      <div class="flow-row">
        <span class="flow-node flow-dest">${lineage.field.name}</span>
        <span class="flow-arrow">←</span>
        <span class="flow-node flow-source">Hardcoded / System Generated</span>
      </div>
    `;
  }

  flowContent.innerHTML = flowHtml;
}

function displayLineageDetails(lineage) {
  const fieldInfo = document.getElementById('fieldInfo');
  const logicInfo = document.getElementById('logicInfo');
  const joinInfo = document.getElementById('joinInfo');

  if (lineage.field) {
    fieldInfo.innerHTML = `
      <p><strong>Table:</strong> ${lineage.field.table}</p>
      <p><strong>Field:</strong> ${lineage.field.name}</p>
      <p><strong>Data Type:</strong> ${lineage.field.dataType || 'N/A'}</p>
      <p><strong>Description:</strong> ${lineage.field.description || 'N/A'}</p>
    `;
  }

  if (lineage.upstream.length > 0) {
    const hasJoinGroup = lineage.upstream.some(u => u.joinGroup);
    
    if (hasJoinGroup) {
      const joinGroup = lineage.upstream[0].joinGroup;
      joinInfo.innerHTML = `
        <p><strong>Join Tables:</strong></p>
        <table class="join-table">
          <thead>
            <tr><th>Table</th><th>Status</th></tr>
          </thead>
          <tbody>
            ${joinGroup.tables.map(t => `<tr><td>${t}</td><td>${joinGroup.status}</td></tr>`).join('')}
          </tbody>
        </table>
        <p style="margin-top: 10px;"><strong>Join Keys:</strong> ${joinGroup.joinKeys.length > 0 ? joinGroup.joinKeys.join(', ') : 'Unresolved'}</p>
      `;
    } else {
      joinInfo.innerHTML = '<p>No join relationship</p>';
    }

    logicInfo.innerHTML = lineage.upstream.map(u => `
      <div style="margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid #e0e0e0;">
        <p><strong>Source:</strong> ${u.table}.${u.field}</p>
        <div class="logic-code">${u.logic || 'No transformation logic'}</div>
        ${u.remarks ? `<p style="margin-top: 8px;"><strong>Remarks:</strong> ${u.remarks}</p>` : ''}
      </div>
    `).join('');
  } else {
    logicInfo.innerHTML = '<p>No upstream sources</p>';
    joinInfo.innerHTML = '';
  }
}

function renderLineageGraph(lineage) {
  const container = document.getElementById('lineageGraph');
  container.innerHTML = '';

  const width = container.clientWidth;
  const height = 400;

  const svg = d3.select(container)
    .append('svg')
    .attr('width', width)
    .attr('height', height);

  const nodes = [];
  const links = [];

  if (lineage.field) {
    nodes.push({
      id: `dest-${lineage.field.table}-${lineage.field.name}`,
      name: lineage.field.name,
      type: 'destination',
      x: width - 150,
      y: height / 2
    });
  }

  const sourceGroups = {};
  lineage.upstream.forEach(u => {
    if (!sourceGroups[u.table]) {
      sourceGroups[u.table] = [];
    }
    sourceGroups[u.table].push(u);
  });

  Object.keys(sourceGroups).forEach((table, tableIndex) => {
    const sources = sourceGroups[table];
    const groupNodeId = `group-${table}`;
    
    nodes.push({
      id: groupNodeId,
      name: table,
      type: 'source-group',
      x: 100,
      y: (tableIndex + 1) * (height / (Object.keys(sourceGroups).length + 1))
    });

    sources.forEach((source, sourceIndex) => {
      const fieldNodeId = `source-${source.table}-${source.field}`;
      nodes.push({
        id: fieldNodeId,
        name: source.field,
        type: 'source',
        x: 250,
        y: nodes.find(n => n.id === groupNodeId).y + (sourceIndex * 30)
      });

      links.push({
        source: groupNodeId,
        target: fieldNodeId
      });

      if (lineage.field) {
        links.push({
          source: fieldNodeId,
          target: `dest-${lineage.field.table}-${lineage.field.name}`,
          logic: source.logic
        });
      }
    });
  });

  const simulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id(d => d.id).distance(120))
    .force('charge', d3.forceManyBody().strength(-400))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('x', d3.forceX().x(d => d.x).strength(0.1))
    .force('y', d3.forceY().y(d => d.y).strength(0.1));

  const link = svg.append('g')
    .selectAll('line')
    .data(links)
    .join('line')
    .attr('class', 'link');

  const node = svg.append('g')
    .selectAll('g')
    .data(nodes)
    .join('g')
    .call(d3.drag()
      .on('start', dragstarted)
      .on('drag', dragged)
      .on('end', dragended));

  node.append('rect')
    .attr('width', 120)
    .attr('height', 40)
    .attr('fill', d => {
      if (d.type === 'destination') return '#3498db';
      if (d.type === 'source-group') return '#e74c3c';
      return '#2ecc71';
    })
    .attr('stroke', '#333')
    .attr('stroke-width', 2)
    .attr('rx', 8);

  node.append('text')
    .attr('x', 60)
    .attr('y', 24)
    .attr('text-anchor', 'middle')
    .attr('fill', 'white')
    .attr('font-size', '11px')
    .text(d => d.name.length > 14 ? d.name.substring(0, 12) + '...' : d.name);

  simulation.on('tick', () => {
    link
      .attr('x1', d => d.source.x)
      .attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x)
      .attr('y2', d => d.target.y);

    node.attr('transform', d => `translate(${d.x - 60},${d.y - 20})`);
  });

  function dragstarted(event, d) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
  }

  function dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
  }

  function dragended(event, d) {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
  }

  node.on('click', (event, d) => {
    const details = document.getElementById('fieldInfo');
    details.innerHTML = `
      <p><strong>Name:</strong> ${d.name}</p>
      <p><strong>Type:</strong> ${d.type}</p>
    `;
  });
}

function renderFullGraph(graphData) {
  const container = document.getElementById('lineageGraph');
  container.innerHTML = '';

  const width = container.clientWidth;
  const height = 700;

  const zoomControls = document.createElement('div');
  zoomControls.className = 'zoom-controls';
  zoomControls.innerHTML = `
    <button class="zoom-btn" id="zoomIn" title="Zoom In">+</button>
    <button class="zoom-btn" id="zoomOut" title="Zoom Out">−</button>
    <button class="zoom-btn" id="zoomReset" title="Reset View">⟲</button>
    <span class="zoom-level" id="zoomLevel">100%</span>
  `;
  container.appendChild(zoomControls);

  const legend = document.createElement('div');
  legend.className = 'graph-legend';
  legend.innerHTML = `
    <span class="legend-item"><span class="legend-color" style="background:#c0392b"></span>Source Table</span>
    <span class="legend-item"><span class="legend-color" style="background:#e74c3c"></span>Source Field</span>
    <span class="legend-item"><span class="legend-color" style="background:#27ae60"></span>Dest Field</span>
    <span class="legend-item"><span class="legend-color" style="background:#2980b9"></span>Dest Table</span>
  `;
  container.appendChild(legend);

  const flowDir = document.createElement('div');
  flowDir.className = 'flow-direction';
  flowDir.innerHTML = '<span>Source Table</span> <span class="flow-arrow-label">→</span> <span>Source Field</span> <span class="flow-arrow-label">→</span> <span>Dest Field</span> <span class="flow-arrow-label">→</span> <span>Dest Table</span>';
  container.appendChild(flowDir);

  const defs = d3.select(container)
    .append('svg')
    .attr('width', 0)
    .attr('height', 0)
    .append('defs');

  defs.append('marker')
    .attr('id', 'arrowhead')
    .attr('viewBox', '0 0 10 10')
    .attr('refX', 9)
    .attr('refY', 5)
    .attr('markerWidth', 6)
    .attr('markerHeight', 6)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M 0 0 L 10 5 L 0 10 z')
    .attr('fill', '#999');

  defs.append('marker')
    .attr('id', 'arrowhead-highlight')
    .attr('viewBox', '0 0 10 10')
    .attr('refX', 9)
    .attr('refY', 5)
    .attr('markerWidth', 8)
    .attr('markerHeight', 8)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M 0 0 L 10 5 L 0 10 z')
    .attr('fill', '#e74c3c');

  const svg = d3.select(container)
    .append('svg')
    .attr('width', width)
    .attr('height', height);

  const g = svg.append('g');

  const zoom = d3.zoom()
    .scaleExtent([0.1, 4])
    .on('zoom', (event) => {
      g.attr('transform', event.transform);
      document.getElementById('zoomLevel').textContent = Math.round(event.transform.k * 100) + '%';
    });

  svg.call(zoom);

  document.getElementById('zoomIn').addEventListener('click', () => {
    svg.transition().duration(300).call(zoom.scaleBy, 1.3);
  });

  document.getElementById('zoomOut').addEventListener('click', () => {
    svg.transition().duration(300).call(zoom.scaleBy, 0.7);
  });

  document.getElementById('zoomReset').addEventListener('click', () => {
    svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity);
  });

  const simulation = d3.forceSimulation(graphData.nodes)
    .force('link', d3.forceLink(graphData.edges).id(d => d.id).distance(100))
    .force('charge', d3.forceManyBody().strength(-1000))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('x', d3.forceX()
      .x(d => {
        if (d.type === 'src-table') return 80;
        if (d.type === 'src-field') return 250;
        if (d.type === 'dest-field') return width - 250;
        if (d.type === 'dest-table') return width - 80;
        return width / 2;
      })
      .strength(0.7))
    .force('y', d3.forceY().y(height / 2).strength(0.05))
    .force('collision', d3.forceCollide().radius(50));

  const linkGroup = g.append('g').attr('class', 'links');

  const link = linkGroup
    .selectAll('path')
    .data(graphData.edges)
    .join('path')
    .attr('class', d => `link link-${d.type}`)
    .attr('stroke', d => {
      if (d.type === 'mapping') return '#e67e22';
      if (d.type === 'table-to-field') return '#c0392b';
      if (d.type === 'field-to-table') return '#2980b9';
      return '#999';
    })
    .attr('stroke-width', d => d.type === 'mapping' ? 2 : 1.5)
    .attr('stroke-dasharray', d => d.type === 'mapping' ? '5,3' : 'none')
    .attr('fill', 'none')
    .attr('marker-end', 'url(#arrowhead)');

  const nodeGroup = g.append('g').attr('class', 'nodes');

  const node = nodeGroup
    .selectAll('g')
    .data(graphData.nodes)
    .join('g')
    .attr('class', 'graph-node')
    .call(d3.drag()
      .on('start', dragstarted)
      .on('drag', dragged)
      .on('end', dragended));

  node.each(function(d) {
    const el = d3.select(this);
    let nodeWidth, nodeHeight, fillColor, label;

    switch(d.type) {
      case 'src-table':
        nodeWidth = 140;
        nodeHeight = 45;
        fillColor = '#c0392b';
        label = 'SOURCE';
        break;
      case 'src-field':
        nodeWidth = 120;
        nodeHeight = 40;
        fillColor = '#e74c3c';
        label = d.table || '';
        break;
      case 'dest-field':
        nodeWidth = 120;
        nodeHeight = 40;
        fillColor = '#27ae60';
        label = d.table || '';
        break;
      case 'dest-table':
        nodeWidth = 140;
        nodeHeight = 45;
        fillColor = '#2980b9';
        label = 'TARGET';
        break;
      default:
        nodeWidth = 110;
        nodeHeight = 36;
        fillColor = '#7f8c8d';
        label = '';
    }

    el.append('rect')
      .attr('width', nodeWidth)
      .attr('height', nodeHeight)
      .attr('x', -nodeWidth / 2)
      .attr('y', -nodeHeight / 2)
      .attr('fill', fillColor)
      .attr('stroke', '#333')
      .attr('stroke-width', 2)
      .attr('rx', 8)
      .attr('ry', 8);

    el.append('text')
      .attr('y', label ? -4 : 2)
      .attr('text-anchor', 'middle')
      .attr('fill', 'white')
      .attr('font-size', '11px')
      .attr('font-weight', 'bold')
      .text(() => {
        const name = d.name || '';
        return name.length > 16 ? name.substring(0, 14) + '...' : name;
      });

    if (label) {
      el.append('text')
        .attr('y', 12)
        .attr('text-anchor', 'middle')
        .attr('fill', 'rgba(255,255,255,0.75)')
        .attr('font-size', '8px')
        .text(label);
    }
  });

  node.on('click', (event, d) => {
    node.selectAll('rect').attr('stroke', '#333').attr('stroke-width', 2);
    d3.select(event.currentTarget).select('rect').attr('stroke', '#f39c12').attr('stroke-width', 3);

    link
      .attr('stroke', dd => {
        if (dd.type === 'mapping') return '#e67e22';
        if (dd.type === 'table-to-field') return '#c0392b';
        if (dd.type === 'field-to-table') return '#2980b9';
        return '#999';
      })
      .attr('stroke-width', dd => dd.type === 'mapping' ? 2 : 1.5)
      .attr('marker-end', 'url(#arrowhead)');

    graphData.edges.forEach(e => {
      if (e.source.id === d.id || e.target.id === d.id) {
        link.filter(l => l.source.id === e.source.id && l.target.id === e.target.id)
          .attr('stroke', '#f39c12')
          .attr('stroke-width', 4)
          .attr('marker-end', 'url(#arrowhead-highlight)');
      }
    });

    showNodeDetails(d);
  });

  const tooltip = d3.select(container)
    .append('div')
    .attr('class', 'graph-tooltip')
    .style('display', 'none');

  node.on('mouseover', (event, d) => {
    const typeLabels = {
      'src-table': 'Source Table',
      'src-field': 'Source Field',
      'dest-field': 'Destination Field',
      'dest-table': 'Destination Table'
    };
    tooltip.style('display', 'block')
      .html(`<strong>${d.name}</strong><br/><span style="color:#aaa">${typeLabels[d.type] || d.type}</span>${d.table ? `<br/>Table: ${d.table}` : ''}`)
      .style('left', (event.offsetX + 15) + 'px')
      .style('top', (event.offsetY - 10) + 'px');
  })
  .on('mouseout', () => {
    tooltip.style('display', 'none');
  });

  simulation.on('tick', () => {
    link.attr('d', d => {
      const dx = d.target.x - d.source.x;
      const dy = d.target.y - d.source.y;
      const dr = Math.sqrt(dx * dx + dy * dy) * 2;
      return `M${d.source.x},${d.source.y}A${dr},${dr} 0 0,1 ${d.target.x},${d.target.y}`;
    });

    node.attr('transform', d => `translate(${d.x},${d.y})`);
  });

  function dragstarted(event, d) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
  }

  function dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
  }

  function dragended(event, d) {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
  }
}

function showNodeDetails(d) {
  const fieldInfo = document.getElementById('fieldInfo');
  const logicInfo = document.getElementById('logicInfo');
  const joinInfo = document.getElementById('joinInfo');

  fieldInfo.innerHTML = `
    <p><strong>Name:</strong> ${d.name}</p>
    <p><strong>Type:</strong> ${d.type}</p>
    ${d.table ? `<p><strong>Table:</strong> ${d.table}</p>` : ''}
    ${d.dataType ? `<p><strong>Data Type:</strong> ${d.dataType}</p>` : ''}
  `;

  if (d.logic) {
    logicInfo.innerHTML = `<div class="logic-code">${d.logic}</div>`;
  } else {
    logicInfo.innerHTML = '<p>No transformation logic</p>';
  }

  joinInfo.innerHTML = '';
}

function exportDataset(format) {
  if (!currentDatasetId) return;
  window.open(`${API_BASE}/api/export/${currentDatasetId}/${format}`, '_blank');
}
