const XLSX = require('xlsx');

const data = [
  {
    'Destination Table': 'STG_TARGET',
    'Destination Field': 'ACCT_NO',
    'Data Type': 'VARCHAR(50)',
    'Description': 'Account Number',
    'Source Table': 'STG_UBS_GETM_LIAB',
    'Source Field': 'LIAB_NO',
    'Logic': "ISNULL(CAST(liab.liab_no AS VARCHAR),'')",
    'Remarks': 'refer to NO_REKENING',
    'Flag': 'GAF'
  },
  {
    'Destination Table': 'STG_TARGET',
    'Destination Field': 'ACCT_NO',
    'Data Type': 'VARCHAR(50)',
    'Description': 'Account Number',
    'Source Table': 'STG_UBS_GETM_FACILITY',
    'Source Field': 'LINE_CODE',
    'Logic': "ISNULL(CAST(facility.line_code AS VARCHAR),'')",
    'Remarks': 'concatenated with LINE_SERIAL',
    'Flag': 'GAF'
  },
  {
    'Destination Table': 'STG_TARGET',
    'Destination Field': 'ACCT_NO',
    'Data Type': 'VARCHAR(50)',
    'Description': 'Account Number',
    'Source Table': 'STG_UBS_GETM_FACILITY',
    'Source Field': 'LINE_SERIAL',
    'Logic': "ISNULL(CAST(facility.line_serial AS VARCHAR),'')",
    'Remarks': 'concatenated with LINE_CODE',
    'Flag': 'GAF'
  },
  {
    'Destination Table': 'STG_TARGET',
    'Destination Field': 'CUST_NAME',
    'Data Type': 'VARCHAR(100)',
    'Description': 'Customer Name',
    'Source Table': 'STG_UBS_GETM_CUST',
    'Source Field': 'NAME',
    'Logic': 'CUST.NAME',
    'Remarks': '',
    'Flag': ''
  },
  {
    'Destination Table': 'STG_TARGET',
    'Destination Field': 'BALANCE',
    'Data Type': 'DECIMAL(18,2)',
    'Description': 'Account Balance',
    'Source Table': 'STG_UBS_GETM_LIAB',
    'Source Field': 'OUTSTANDING_BAL',
    'Logic': 'liab.OUTSTANDING_BAL',
    'Remarks': 'current balance',
    'Flag': 'FIN'
  }
];

const ws = XLSX.utils.json_to_sheet(data);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Mapping');
XLSX.writeFile(wb, 'test_mapping.xlsx');

console.log('Test file created: test_mapping.xlsx');
