const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const XLSX = require('xlsx');
const fs = require('fs').promises;

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(__dirname, 'uploads');

async function ensureDirectories() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
}

function parseExcelToMapping(filePath) {
  const workbook = XLSX.readFile(filePath);
  
  let targetSheet = workbook.SheetNames.find(name => 
    name.toUpperCase().includes('MAPPING') || 
    name.toUpperCase().includes('LIMIT') ||
    name.toUpperCase().includes('FIELD')
  );
  if (!targetSheet) targetSheet = workbook.SheetNames[0];
  
  const ws = workbook.Sheets[targetSheet];
  const rawData = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  let destTable = '';
  const dataSourceSection = [];
  const mappingFieldSection = [];
  let currentSection = null;
  let mappingHeaderFound = false;
  let mappingColOffset = 0;

  for (let i = 0; i < rawData.length; i++) {
    const row = rawData[i];
    const rowStr = row.map(c => (c || '').toString().trim()).join('|');

    if (rowStr.includes('DESTINATION TABLE:')) {
      const match = row[0].toString().match(/DESTINATION TABLE:\s*(.+)/i);
      if (match) destTable = match[1].trim();
      continue;
    }

    if (rowStr.includes('MAPPING FIELD')) {
      currentSection = 'mapping';
      mappingHeaderFound = true;
      continue;
    }

    if (rowStr.includes('DATA SOURCE') && !rowStr.includes('MAPPING') && !mappingHeaderFound) {
      currentSection = 'datasource';
      continue;
    }

    if (rowStr.includes('DESTINATION FIELD') && rowStr.includes('SOURCE TABLE')) {
      const destIdx = row.findIndex(c => (c || '').toString().includes('DESTINATION FIELD'));
      const srcIdx = row.findIndex(c => (c || '').toString().includes('SOURCE TABLE'));
      if (destIdx >= 0 && srcIdx >= 0) {
        mappingColOffset = srcIdx - 5;
      }
      continue;
    }

    if (rowStr.includes('No.') && rowStr.includes('Field Name') && rowStr.includes('SOURCE TABLE')) {
      continue;
    }

    if (currentSection === 'datasource' && row[0] !== null && row[0] !== undefined && row[0] !== '') {
      const no = row[0];
      if (typeof no === 'number' && no > 0) {
        const alias = row[4] || '';
        const joinType = row[5] || '-';
        const joinCondition = row[6] || '';
        const remarks = row[7] || '';

        dataSourceSection.push({
          no: no,
          schema: row[1] || '',
          tableName: (row[2] || '').toString().replace(/\r\n/g, '\n').trim(),
          type: row[3] || '',
          alias: alias,
          joinType: joinType,
          joinCondition: joinCondition,
          remarks: remarks
        });
      }
    }

    if (currentSection === 'mapping' && row[0] !== null && row[0] !== undefined) {
      const no = row[0];
      if (typeof no === 'number' && no > 0) {
        const srcTableCol = 4 + mappingColOffset;
        const srcFieldCol = 5 + mappingColOffset;
        const logicCol = 6 + mappingColOffset;
        const remarksCol = 7 + mappingColOffset;
        const gapCol = 8 + mappingColOffset;
        
        let desc = row[2] || '';
        let dataType = row[3] || '';
        
        if (mappingColOffset > 0) {
          desc = row[2] || row[3] || '';
          dataType = row[4] || '';
        }

        mappingFieldSection.push({
          no: no,
          fieldName: row[1] || '',
          description: desc,
          dataType: dataType,
          sourceTable: (row[srcTableCol] || '').toString().replace(/\r\n/g, '\n').trim(),
          sourceField: (row[srcFieldCol] || '').toString().replace(/\r\n/g, '\n').trim(),
          logic: (row[logicCol] || '').toString().replace(/\r\n/g, '\n').trim(),
          remarks: (row[remarksCol] || '').toString().replace(/\r\n/g, '\n').trim(),
          gap: row[gapCol] || ''
        });
      }
    }
  }

  const aliasMap = {};
  dataSourceSection.forEach(ds => {
    if (ds.alias) {
      aliasMap[ds.alias.toLowerCase()] = ds.tableName;
    }
  });

  const datasets = {};
  const tables = {};

  dataSourceSection.forEach(ds => {
    const tableNames = ds.tableName.split('\n').map(t => t.trim()).filter(Boolean);
    tableNames.forEach(tName => {
      if (!tables[tName]) {
        tables[tName] = {
          name: tName,
          classification: 'source',
          alias: ds.alias,
          joinType: ds.joinType,
          joinCondition: ds.joinCondition,
          fields: {}
        };
      }
    });
  });

  mappingFieldSection.forEach(row => {
    if (!row.fieldName) return;

    if (!datasets[destTable]) {
      datasets[destTable] = {
        name: destTable,
        classification: 'destination',
        fields: {}
      };
    }

    const sourceTableRaw = row.sourceTable || '';
    const sourceFieldRaw = row.sourceField || '';

    const sourceTableList = sourceTableRaw.split('\n').map(t => t.trim()).filter(Boolean);
    const sourceFieldList = sourceFieldRaw.split('\n').map(f => f.trim()).filter(Boolean);

    const expandedMappings = [];

    if (sourceTableList.length === 0 && sourceFieldList.length === 0) {
      expandedMappings.push({
        id: uuidv4(),
        sourceTable: '',
        sourceField: '',
        logic: row.logic,
        remarks: row.remarks,
        gap: row.gap,
        joinGroup: null
      });
    } else if (sourceTableList.length <= sourceFieldList.length) {
      sourceFieldList.forEach((sf, idx) => {
        const st = sourceTableList[idx] || sourceTableList[sourceTableList.length - 1] || '';
        expandedMappings.push({
          id: uuidv4(),
          sourceTable: st,
          sourceField: sf,
          logic: row.logic,
          remarks: row.remarks,
          gap: row.gap,
          joinGroup: null
        });
      });
    } else {
      sourceTableList.forEach((st, idx) => {
        const sf = sourceFieldList[idx] || sourceFieldList[0] || '';
        expandedMappings.push({
          id: uuidv4(),
          sourceTable: st,
          sourceField: sf,
          logic: row.logic,
          remarks: row.remarks,
          gap: row.gap,
          joinGroup: null
        });
      });
    }

    if (!datasets[destTable].fields[row.fieldName]) {
      datasets[destTable].fields[row.fieldName] = {
        name: row.fieldName,
        dataType: row.dataType,
        description: row.description,
        mappings: []
      };
    }

    datasets[destTable].fields[row.fieldName].mappings.push(...expandedMappings);

    expandedMappings.forEach(m => {
      if (m.sourceTable && !tables[m.sourceTable]) {
        tables[m.sourceTable] = {
          name: m.sourceTable,
          classification: 'source',
          fields: {}
        };
      }
      if (m.sourceTable && m.sourceField && tables[m.sourceTable]) {
        if (!tables[m.sourceTable].fields[m.sourceField]) {
          tables[m.sourceTable].fields[m.sourceField] = {
            name: m.sourceField,
            dataType: '',
            description: ''
          };
        }
      }
    });
  });

  Object.keys(datasets).forEach(tableName => {
    Object.keys(datasets[tableName].fields).forEach(fieldName => {
      const field = datasets[tableName].fields[fieldName];
      const uniqueSourceTables = [...new Set(field.mappings.map(m => m.sourceTable).filter(Boolean))];

      if (uniqueSourceTables.length > 1) {
        const joinInfo = [];
        uniqueSourceTables.forEach(st => {
          const dsEntry = dataSourceSection.find(d => {
            const names = d.tableName.split('\n').map(n => n.trim());
            return names.includes(st);
          });
          if (dsEntry) {
            joinInfo.push({
              table: st,
              alias: dsEntry.alias,
              joinType: dsEntry.joinType,
              joinCondition: dsEntry.joinCondition
            });
          }
        });

        const joinGroup = {
          tables: uniqueSourceTables,
          joinInfo: joinInfo,
          status: joinInfo.some(j => j.joinCondition) ? 'resolved' : 'unresolved'
        };

        field.mappings.forEach(m => {
          m.joinGroup = joinGroup;
        });
      }

      field.sourceSummary = uniqueSourceTables.filter(Boolean);
    });
  });

  return {
    destinationTable: destTable,
    dataSources: dataSourceSection,
    datasets: Object.values(datasets),
    tables: Object.values(tables)
  };
}

app.post('/api/upload', upload.single('mappingFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = req.file.path;
    const parsedData = parseExcelToMapping(filePath);

    const datasetId = uuidv4();
    const dataset = {
      id: datasetId,
      name: req.file.originalname,
      uploadDate: new Date().toISOString(),
      version: 1,
      uploadedBy: req.body.uploadedBy || 'anonymous',
      ...parsedData
    };

    const outputPath = path.join(DATA_DIR, `${datasetId}.json`);
    await fs.writeFile(outputPath, JSON.stringify(dataset, null, 2));

    res.json({
      success: true,
      datasetId: datasetId,
      message: 'File uploaded and parsed successfully',
      stats: {
        destinationTable: dataset.destinationTable,
        dataSources: dataset.dataSources.length,
        sourceTables: dataset.tables.length,
        destinationFields: dataset.datasets.reduce((sum, ds) => sum + Object.keys(ds.fields).length, 0),
        mappings: dataset.datasets.reduce((sum, ds) => {
          return sum + Object.values(ds.fields).reduce((fSum, f) => fSum + f.mappings.length, 0);
        }, 0)
      }
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to process file' });
  }
});

app.get('/api/datasets', async (req, res) => {
  try {
    const files = await fs.readdir(DATA_DIR);
    const datasets = [];
    
    for (const file of files) {
      if (file.endsWith('.json')) {
        const content = await fs.readFile(path.join(DATA_DIR, file), 'utf8');
        const dataset = JSON.parse(content);
        datasets.push({
          id: dataset.id,
          name: dataset.name,
          uploadDate: dataset.uploadDate,
          version: dataset.version
        });
      }
    }
    
    res.json(datasets);
  } catch (error) {
    res.status(500).json({ error: 'Failed to list datasets' });
  }
});

app.get('/api/datasets/:id', async (req, res) => {
  try {
    const filePath = path.join(DATA_DIR, `${req.params.id}.json`);
    const content = await fs.readFile(filePath, 'utf8');
    res.json(JSON.parse(content));
  } catch (error) {
    res.status(404).json({ error: 'Dataset not found' });
  }
});

app.delete('/api/datasets/:id', async (req, res) => {
  try {
    const filePath = path.join(DATA_DIR, `${req.params.id}.json`);
    await fs.access(filePath);
    await fs.unlink(filePath);
    res.json({ success: true, message: 'Dataset deleted successfully' });
  } catch (error) {
    res.status(404).json({ error: 'Dataset not found' });
  }
});

app.get('/api/search', async (req, res) => {
  try {
    const { q, datasetId, type } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'Search query required' });
    }

    const searchQuery = q.toLowerCase();
    const results = { destinations: [], sources: [] };

    const files = await fs.readdir(DATA_DIR);
    
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      if (datasetId && !file.startsWith(datasetId)) continue;
      
      const content = await fs.readFile(path.join(DATA_DIR, file), 'utf8');
      const dataset = JSON.parse(content);

      if (type !== 'source') {
        dataset.datasets.forEach(ds => {
          Object.keys(ds.fields).forEach(fieldName => {
            const field = ds.fields[fieldName];
            if (fieldName.toLowerCase().includes(searchQuery) || 
                ds.name.toLowerCase().includes(searchQuery)) {
              results.destinations.push({
                datasetId: dataset.id,
                tableName: ds.name,
                fieldName: field.name,
                dataType: field.dataType,
                description: field.description,
                mappings: field.mappings
              });
            }
          });
        });
      }

      if (type !== 'destination') {
        dataset.tables.forEach(tbl => {
          Object.keys(tbl.fields).forEach(fieldName => {
            if (fieldName.toLowerCase().includes(searchQuery) || 
                tbl.name.toLowerCase().includes(searchQuery)) {
              results.sources.push({
                datasetId: dataset.id,
                tableName: tbl.name,
                fieldName: tbl.fields[fieldName].name
              });
            }
          });
        });
      }
    }

    res.json(results);
  } catch (error) {
    res.status(500).json({ error: 'Search failed' });
  }
});

app.get('/api/lineage/:datasetId/:tableName/:fieldName', async (req, res) => {
  try {
    const filePath = path.join(DATA_DIR, `${req.params.datasetId}.json`);
    const content = await fs.readFile(filePath, 'utf8');
    const dataset = JSON.parse(content);

    const { tableName, fieldName } = req.params;
    const lineage = {
      field: null,
      upstream: [],
      downstream: []
    };

    dataset.datasets.forEach(ds => {
      if (ds.name === tableName && ds.fields[fieldName]) {
        const field = ds.fields[fieldName];
        lineage.field = {
          name: field.name,
          dataType: field.dataType,
          description: field.description,
          table: ds.name,
          type: 'destination'
        };

        field.mappings.forEach(mapping => {
          lineage.upstream.push({
            table: mapping.sourceTable,
            field: mapping.sourceField,
            logic: mapping.logic,
            remarks: mapping.remarks,
            joinGroup: mapping.joinGroup
          });
        });
      }
    });

    dataset.datasets.forEach(ds => {
      Object.keys(ds.fields).forEach(fieldName => {
        const field = ds.fields[fieldName];
        field.mappings.forEach(mapping => {
          if (mapping.sourceTable === tableName && mapping.sourceField === fieldName) {
            lineage.downstream.push({
              table: ds.name,
              fieldName: field.name,
              logic: mapping.logic
            });
          }
        });
      });
    });

    res.json(lineage);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get lineage' });
  }
});

app.get('/api/graph/:datasetId', async (req, res) => {
  try {
    const filePath = path.join(DATA_DIR, `${req.params.datasetId}.json`);
    const content = await fs.readFile(filePath, 'utf8');
    const dataset = JSON.parse(content);

    const nodes = [];
    const edges = [];
    const nodeIds = new Set();

    const destTableNodeId = `desttable-${dataset.destinationTable}`;
    nodes.push({
      id: destTableNodeId,
      name: dataset.destinationTable,
      type: 'dest-table',
      classification: 'destination'
    });
    nodeIds.add(destTableNodeId);

    dataset.datasets.forEach(ds => {
      Object.keys(ds.fields).forEach(fieldName => {
        const field = ds.fields[fieldName];
        const destFieldNodeId = `destfield-${ds.name}-${fieldName}`;

        if (!nodeIds.has(destFieldNodeId)) {
          nodes.push({
            id: destFieldNodeId,
            name: fieldName,
            type: 'dest-field',
            dataType: field.dataType,
            table: ds.name,
            description: field.description
          });
          nodeIds.add(destFieldNodeId);
        }

        edges.push({
          id: `edge-df-${fieldName}`,
          source: destFieldNodeId,
          target: destTableNodeId,
          label: 'belongs to',
          type: 'field-to-table'
        });

        field.mappings.forEach(mapping => {
          if (!mapping.sourceTable || !mapping.sourceField) return;

          const sourceTableNodeId = `srctable-${mapping.sourceTable}`;
          if (!nodeIds.has(sourceTableNodeId)) {
            const dsInfo = dataset.dataSources.find(d => {
              const names = d.tableName.split('\n').map(n => n.trim());
              return names.includes(mapping.sourceTable);
            });
            nodes.push({
              id: sourceTableNodeId,
              name: mapping.sourceTable,
              type: 'src-table',
              alias: dsInfo ? dsInfo.alias : '',
              schema: dsInfo ? dsInfo.schema : ''
            });
            nodeIds.add(sourceTableNodeId);
          }

          const sourceFieldNodeId = `srcfield-${mapping.sourceTable}-${mapping.sourceField}`;
          if (!nodeIds.has(sourceFieldNodeId)) {
            nodes.push({
              id: sourceFieldNodeId,
              name: mapping.sourceField,
              type: 'src-field',
              table: mapping.sourceTable
            });
            nodeIds.add(sourceFieldNodeId);
          }

          edges.push({
            id: `edge-sft-${mapping.sourceTable}-${mapping.sourceField}`,
            source: sourceTableNodeId,
            target: sourceFieldNodeId,
            label: 'contains',
            type: 'table-to-field'
          });

          edges.push({
            id: `edge-map-${mapping.id}`,
            source: sourceFieldNodeId,
            target: destFieldNodeId,
            label: mapping.logic ? mapping.logic.substring(0, 30) : 'maps',
            logic: mapping.logic,
            remarks: mapping.remarks,
            type: 'mapping'
          });
        });
      });
    });

    const uniqueEdges = [];
    const edgeIds = new Set();
    edges.forEach(e => {
      const key = `${e.source}-${e.target}`;
      if (!edgeIds.has(key)) {
        edgeIds.add(key);
        uniqueEdges.push(e);
      }
    });

    res.json({ nodes, edges: uniqueEdges });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate graph' });
  }
});

app.get('/api/combined-lineage', async (req, res) => {
  try {
    const files = await fs.readdir(DATA_DIR);
    const datasets = [];
    
    for (const file of files) {
      if (file.endsWith('.json')) {
        const content = await fs.readFile(path.join(DATA_DIR, file), 'utf8');
        datasets.push(JSON.parse(content));
      }
    }

    if (datasets.length === 0) {
      return res.json({ nodes: [], edges: [], layers: [] });
    }

    const aimDataset = datasets.find(d => d.destinationTable === 'IM_LIMIT');
    const dmDataset = datasets.find(d => d.destinationTable === 'DM_LIMIT');
    
    const nodes = [];
    const edges = [];
    const nodeIds = new Set();
    const layers = [];

    if (aimDataset) {
      const stgTables = new Set();
      const aimFields = {};
      
      aimDataset.datasets.forEach(ds => {
        Object.keys(ds.fields).forEach(fieldName => {
          const field = ds.fields[fieldName];
          field.mappings.forEach(mapping => {
            if (mapping.sourceTable) {
              stgTables.add(mapping.sourceTable);
            }
          });
        });
      });

      layers.push({
        id: 'staging',
        name: 'STAGING',
        color: '#3498db',
        position: 0
      });

      stgTables.forEach(tableName => {
        const nodeId = `stg-${tableName}`;
        if (!nodeIds.has(nodeId)) {
          const dsInfo = aimDataset.dataSources.find(d => {
            const names = d.tableName.split('\n').map(n => n.trim());
            return names.includes(tableName);
          });
          nodes.push({
            id: nodeId,
            name: tableName,
            type: 'src-table',
            layer: 'staging',
            alias: dsInfo ? dsInfo.alias : '',
            schema: dsInfo ? dsInfo.schema : ''
          });
          nodeIds.add(nodeId);
        }
      });

      layers.push({
        id: 'aim',
        name: 'AIM',
        color: '#27ae60',
        position: 1
      });

      const aimTableNodeId = `aim-${aimDataset.destinationTable}`;
      if (!nodeIds.has(aimTableNodeId)) {
        nodes.push({
          id: aimTableNodeId,
          name: aimDataset.destinationTable,
          type: 'aim-table',
          layer: 'aim'
        });
        nodeIds.add(aimTableNodeId);
      }

      aimDataset.datasets.forEach(ds => {
        Object.keys(ds.fields).forEach(fieldName => {
          const field = ds.fields[fieldName];
          const fieldNodeId = `aimfield-${ds.name}-${fieldName}`;
          
          if (!nodeIds.has(fieldNodeId)) {
            nodes.push({
              id: fieldNodeId,
              name: fieldName,
              type: 'aim-field',
              layer: 'aim',
              table: ds.name,
              dataType: field.dataType,
              description: field.description
            });
            nodeIds.add(fieldNodeId);
          }

          edges.push({
            id: `e-aimf-${fieldName}`,
            source: fieldNodeId,
            target: aimTableNodeId,
            type: 'field-to-table',
            layer: 'aim'
          });

          field.mappings.forEach(mapping => {
            if (!mapping.sourceTable || !mapping.sourceField) return;

            const srcTableNodeId = `stg-${mapping.sourceTable}`;
            const srcFieldNodeId = `stgfield-${mapping.sourceTable}-${mapping.sourceField}`;
            
            if (!nodeIds.has(srcFieldNodeId)) {
              nodes.push({
                id: srcFieldNodeId,
                name: mapping.sourceField,
                type: 'src-field',
                layer: 'staging',
                table: mapping.sourceTable
              });
              nodeIds.add(srcFieldNodeId);
            }

            edges.push({
              id: `e-stgt-${mapping.sourceTable}-${mapping.sourceField}`,
              source: srcTableNodeId,
              target: srcFieldNodeId,
              type: 'table-to-field',
              layer: 'staging'
            });

            edges.push({
              id: `e-stgaim-${mapping.id}`,
              source: srcFieldNodeId,
              target: fieldNodeId,
              type: 'mapping',
              layer: 'staging-to-aim',
              logic: mapping.logic
            });
          });
        });
      });
    }

    if (dmDataset) {
      layers.push({
        id: 'dm',
        name: 'DM REPORTING',
        color: '#e74c3c',
        position: 2
      });

      const dmTableNodeId = `dm-${dmDataset.destinationTable}`;
      if (!nodeIds.has(dmTableNodeId)) {
        nodes.push({
          id: dmTableNodeId,
          name: dmDataset.destinationTable,
          type: 'dm-table',
          layer: 'dm'
        });
        nodeIds.add(dmTableNodeId);
      }

      dmDataset.datasets.forEach(ds => {
        Object.keys(ds.fields).forEach(fieldName => {
          const field = ds.fields[fieldName];
          const fieldNodeId = `dmfield-${ds.name}-${fieldName}`;
          
          if (!nodeIds.has(fieldNodeId)) {
            nodes.push({
              id: fieldNodeId,
              name: fieldName,
              type: 'dm-field',
              layer: 'dm',
              table: ds.name,
              dataType: field.dataType,
              description: field.description
            });
            nodeIds.add(fieldNodeId);
          }

          edges.push({
            id: `e-dmf-${fieldName}`,
            source: fieldNodeId,
            target: dmTableNodeId,
            type: 'field-to-table',
            layer: 'dm'
          });

          field.mappings.forEach(mapping => {
            if (!mapping.sourceTable || !mapping.sourceField) return;

            const aimFieldNodeId = `aimfield-${mapping.sourceTable}-${mapping.sourceField}`;
            
            if (nodeIds.has(aimFieldNodeId)) {
              edges.push({
                id: `e-aimdm-${mapping.id}`,
                source: aimFieldNodeId,
                target: fieldNodeId,
                type: 'mapping',
                layer: 'aim-to-dm',
                logic: mapping.logic
              });
            } else {
              const srcFieldNodeId = `stgfield-${mapping.sourceTable}-${mapping.sourceField}`;
              if (nodeIds.has(srcFieldNodeId)) {
                edges.push({
                  id: `e-stgdm-${mapping.id}`,
                  source: srcFieldNodeId,
                  target: fieldNodeId,
                  type: 'mapping',
                  layer: 'staging-to-dm',
                  logic: mapping.logic
                });
              }
            }
          });
        });
      });
    }

    const uniqueEdges = [];
    const edgeIds = new Set();
    edges.forEach(e => {
      const key = `${e.source}-${e.target}`;
      if (!edgeIds.has(key)) {
        edgeIds.add(key);
        uniqueEdges.push(e);
      }
    });

    res.json({ nodes, edges: uniqueEdges, layers });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate combined lineage' });
  }
});

app.get('/api/export/:datasetId/:format', async (req, res) => {
  try {
    const filePath = path.join(DATA_DIR, `${req.params.datasetId}.json`);
    const content = await fs.readFile(filePath, 'utf8');
    const dataset = JSON.parse(content);

    if (req.params.format === 'json') {
      res.setHeader('Content-Disposition', `attachment; filename="${dataset.name}.json"`);
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify(dataset, null, 2));
    } else if (req.params.format === 'csv') {
      const rows = [];
      rows.push(['Destination Table', 'Destination Field', 'Data Type', 'Description', 
                  'Source Table', 'Source Field', 'Logic', 'Remarks', 'Flag']);
      
      dataset.datasets.forEach(ds => {
        Object.keys(ds.fields).forEach(fieldName => {
          const field = ds.fields[fieldName];
          field.mappings.forEach(mapping => {
            rows.push([
              ds.name,
              field.name,
              field.dataType,
              field.description,
              mapping.sourceTable,
              mapping.sourceField,
              mapping.logic,
              mapping.remarks,
              mapping.flag
            ]);
          });
        });
      });

      const ws = XLSX.utils.aoa_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Lineage');
      
      const csv = XLSX.utils.sheet_to_csv(ws);
      res.setHeader('Content-Disposition', `attachment; filename="${dataset.name}.csv"`);
      res.setHeader('Content-Type', 'text/csv');
      res.send(csv);
    }
  } catch (error) {
    res.status(500).json({ error: 'Export failed' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

ensureDirectories().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Data Mapping & Lineage Explorer is ready`);
  });
});
