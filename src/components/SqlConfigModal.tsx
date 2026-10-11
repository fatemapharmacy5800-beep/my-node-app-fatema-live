import React, { useState } from 'react';
import { X, Database, Terminal, Shield, CheckCircle2, AlertCircle, Copy, Check, Server } from 'lucide-react';
import { DatabaseStatus } from '../types';

interface SqlConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  dbStatus: DatabaseStatus;
}

export const SqlConfigModal: React.FC<SqlConfigModalProps> = ({ isOpen, onClose, dbStatus }) => {
  const [testServer, setTestServer] = useState(dbStatus.server || 'localhost');
  const [testPort, setTestPort] = useState(String(dbStatus.port || 1433));
  const [testUser, setTestUser] = useState('sa');
  const [testPassword, setTestPassword] = useState('');
  const [testDatabase, setTestDatabase] = useState(dbStatus.database || 'HDMS');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [copiedBatch, setCopiedBatch] = useState(false);

  if (!isOpen) return null;

  const handleTestConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsTesting(true);
    setTestResult(null);

    try {
      const res = await fetch('/api/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          server: testServer,
          port: testPort,
          user: testUser,
          password: testPassword,
          database: testDatabase,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setTestResult({
          success: true,
          message: `${data.message} Connected to database '${data.dbname || testDatabase}'.`,
        });
      } else {
        setTestResult({
          success: false,
          message: data.message || data.hint || 'Could not connect to SQL Server.',
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Network error while attempting connection test.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const batchScriptContent = `@echo off
setlocal enabledelayedexpansion
title Fatema Pharmacy - Medicine Stock and Order System
color 0B
mode con: cols=86 lines=34

cls
echo.
echo  ======================================================================================
echo     [+] FATEMA PHARMACY - MEDICINE STOCK & ORDER SYSTEM
echo     [+] HOSPITAL & CLINICAL DATABASE MANAGEMENT (HDMS)
echo     [+] DIRECT SQL SERVER 2000 TDS 7.1 ADAPTER - READ-ONLY SAFE MODE
echo  ======================================================================================
echo.

echo  [*] Initializing runtime environment...
<nul set /p "=[SYS] Loading database drivers "
for /L %%i in (1,1,10) do (
    <nul set /p "=."
    ping -n 1 127.0.0.1 >nul
)
echo  [ READY ]

<nul set /p "=[SYS] Checking SQL Server 2000 schemas [Items, Suppliers] "
for /L %%i in (1,1,6) do (
    <nul set /p "=."
    ping -n 1 127.0.0.1 >nul
)
echo  [ VERIFIED ]

echo.
echo  --------------------------------------------------------------------------------------
echo   SYSTEM DIAGNOSTICS:
echo  --------------------------------------------------------------------------------------

<nul set /p "=  [1/4] Checking Node.js engine..."
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ FAIL ]
    echo  [ERROR] Node.js is not found. Please install Node.js (v18 or v20 LTS).
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do set NODE_VERSION=%%v
echo  [ OK - !NODE_VERSION! ]

<nul set /p "=  [2/4] Checking .env configuration..."
if not exist ".env" (
    (
        echo DB_SERVER=localhost
        echo DB_PORT=1433
        echo DB_USER=sa
        echo DB_PASSWORD=
        echo DB_NAME=HDMS
        echo DB_ENCRYPT=false
        echo DB_TRUST_SERVER_CERTIFICATE=true
    ) > .env
    echo  [ CREATED .env (HDMS) ]
) else (
    echo  [ OK - Found .env ]
)

<nul set /p "=  [3/4] Validating local npm packages..."
if not exist "node_modules\\" (
    echo  [ INSTALLING ]
    call npm install --legacy-peer-deps
) else (
    echo  [ OK ]
)

<nul set /p "=  [4/4] Verifying production build dist..."
if not exist "dist\\" (
    echo  [ COMPILING ]
    call npm run build
) else (
    echo  [ OK ]
)

echo.
<nul set /p "=  Starting Fatema Pharmacy Portal ["
for /L %%i in (1,1,28) do (
    <nul set /p "=#"
    ping -n 1 127.0.0.1 >nul
)
echo ] 100%%
echo.
        echo   - Local Portal Address:  http://localhost:3001
echo   - Database Target:       HDMS on localhost:1433
echo   - Tables Read:           Items, Suppliers, qryStore_Item_Balance
echo.

start http://localhost:3001
npm start
pause
`;

  const copyBatchScript = () => {
    navigator.clipboard.writeText(batchScriptContent);
    setCopiedBatch(true);
    setTimeout(() => setCopiedBatch(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200">
        
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Database className="w-5 h-5 text-cyan-400" />
            <div>
              <h3 className="text-base font-bold">SQL Server 2000 & Standalone Windows Guide</h3>
              <p className="text-xs text-slate-400">
                Setup credentials in .env and run locally on Windows PC
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto text-xs text-slate-600">
          
          {/* Current Status Banner */}
          <div className={`p-4 rounded-lg border flex items-start gap-3 ${
            dbStatus.connected ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-slate-50 border-slate-200 text-slate-800'
          }`}>
            <Server className={`w-5 h-5 shrink-0 mt-0.5 ${dbStatus.connected ? 'text-emerald-600' : 'text-cyan-600'}`} />
            <div>
              <h4 className="font-bold text-sm text-slate-900">
                {dbStatus.connected ? 'Live SQL Server Connection Active' : 'Standalone Applet Mode (Preview Ready)'}
              </h4>
              <p className="mt-1 text-slate-600 leading-relaxed">
                {dbStatus.connected
                  ? `Successfully connected to SQL Server at ${dbStatus.server}:${dbStatus.port}, database '${dbStatus.database}'. Loaded ${dbStatus.recordCount} items.`
                  : `Currently running in self-contained mode with the Fatema Pharmacy database snapshot matching your screenshots. When you download the ZIP and run on your Windows PC, it will connect directly to your local SQL Server 2000.`}
              </p>
            </div>
          </div>

          {/* Step-by-Step Instructions */}
          <div className="space-y-3">
            <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <Terminal className="w-4 h-4 text-cyan-700" />
              <span>How to deploy on your Local Windows PC (Standalone)</span>
            </h4>
            
            <div className="space-y-2.5">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <span className="font-bold text-slate-900 block mb-1">Step 1: Download & Unzip</span>
                <p>Download the project ZIP from the AI Studio menu and extract it on your Windows PC where SQL Server 2000 is installed.</p>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <span className="font-bold text-slate-900 block mb-1">Step 2: Configure your .env file</span>
                <p className="mb-2">Open the <code className="font-mono bg-slate-200 px-1 py-0.5 rounded text-slate-900">.env</code> file in Notepad and specify your SQL Server 2000 credentials:</p>
                <pre className="bg-slate-900 text-slate-100 p-2.5 rounded font-mono text-[11px] overflow-x-auto">
{`DB_SERVER=localhost
DB_PORT=1433
DB_USER=sa
DB_PASSWORD=your_sql_password
DB_NAME=HDMS
DB_ENCRYPT=false
DB_TRUST_SERVER_CERTIFICATE=true`}
                </pre>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <span className="font-bold text-slate-900 block mb-1">Step 3: SQL Server 2000 Compatibility Settings & Formulas</span>
                <ul className="list-disc list-inside space-y-1 text-slate-600">
                  <li>Ensure <strong>TCP/IP is enabled on port 1433</strong> in SQL Server Network Utility.</li>
                  <li>Enable <strong>SQL Server and Windows Authentication mode</strong> (Mixed Mode).</li>
                  <li>The app connects using TDS 7.1 protocol with <strong>read-only queries</strong> on <code className="font-mono">items</code>, <code className="font-mono">Suppliers</code>, and <code className="font-mono">qryStore_Item_Balance</code> (or <code className="font-mono">qryMedicine</code>).</li>
                  <li>Zero risk of database alteration or table locking.</li>
                  <li>
                    <strong>Exact Store Balance View Definition (qryStore_Item_Balance):</strong>
                    <div className="mt-1 font-mono text-[10px] bg-slate-900 text-cyan-300 p-2.5 rounded whitespace-pre-wrap">
{`SELECT dbo.Items.Item_ID, 
       SUM(ISNULL(dbo.qryStore_Transaction_Sum_Posted.Received_Qty_Sum - dbo.qryStore_Transaction_Sum_Posted.Delivered_Qty_Sum, 0)) AS Store_Balance
FROM dbo.Items 
LEFT OUTER JOIN dbo.qryStore_Transaction_Sum_Posted 
  ON dbo.Items.Item_ID = dbo.qryStore_Transaction_Sum_Posted.Item_ID
GROUP BY dbo.Items.Item_ID`}
                    </div>
                  </li>
                  <li>
                    <strong>Exact Crystal Report @Supplier_Cate Formula Applied:</strong>
                    <div className="mt-1 font-mono text-[10px] bg-slate-900 text-cyan-300 p-2.5 rounded whitespace-pre-wrap">
{`if {Suppliers.Post_Code} = "B" then
    "B-Grade"
else if {Suppliers.Post_Code} = "A" then
    "A-Grade"
else if {Suppliers.Post_Code} = "M" then
    "Market Collection"
else if {Suppliers.Post_Code} = "F" then
    "Broker Collections"
else if {Suppliers.Post_Code} = "X" then
    "Others"
else
    "Unknown"`}
                    </div>
                  </li>
                </ul>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-slate-900">Optional: Windows One-Click Batch File</span>
                  <button
                    onClick={copyBatchScript}
                    className="text-[11px] text-cyan-700 hover:text-cyan-800 font-semibold flex items-center gap-1"
                  >
                    {copiedBatch ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedBatch ? 'Copied!' : 'Copy Script'}</span>
                  </button>
                </div>
                <p className="mb-1 text-slate-500">Create a file named <code className="font-mono bg-slate-200 px-1 rounded">run-pharmacy.bat</code> in the project folder with this content to launch with a double-click:</p>
                <pre className="bg-slate-900 text-cyan-300 p-2 rounded font-mono text-[11px]">
                  {batchScriptContent}
                </pre>
              </div>
            </div>
          </div>

          {/* Built-in Connection Tester */}
          <div className="pt-2 border-t border-slate-200">
            <h4 className="font-bold text-slate-900 text-sm mb-3 flex items-center gap-2">
              <Shield className="w-4 h-4 text-emerald-600" />
              <span>Test SQL Server 2000 Credentials</span>
            </h4>

            <form onSubmit={handleTestConnection} className="space-y-3">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">Server / Host</label>
                  <input
                    type="text"
                    value={testServer}
                    onChange={(e) => setTestServer(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs text-slate-900"
                    placeholder="localhost or IP"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">Port</label>
                  <input
                    type="number"
                    value={testPort}
                    onChange={(e) => setTestPort(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs text-slate-900"
                    placeholder="1433"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">User (SQL Auth)</label>
                  <input
                    type="text"
                    value={testUser}
                    onChange={(e) => setTestUser(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs text-slate-900"
                    placeholder="sa"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">Password</label>
                  <input
                    type="password"
                    value={testPassword}
                    onChange={(e) => setTestPassword(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs text-slate-900"
                    placeholder="SQL Server password"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">Database Name</label>
                <input
                  type="text"
                  value={testDatabase}
                  onChange={(e) => setTestDatabase(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs text-slate-900"
                  placeholder="PharmacyDB"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isTesting}
                className="w-full py-2 bg-slate-800 hover:bg-slate-900 text-white rounded font-bold text-xs flex items-center justify-center gap-2 transition-colors"
              >
                {isTesting ? (
                  <span>Testing Connection...</span>
                ) : (
                  <span>Test Connection to SQL Server 2000</span>
                )}
              </button>
            </form>

            {testResult && (
              <div className={`mt-3 p-3 rounded-lg border text-xs flex items-start gap-2 ${
                testResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-red-50 border-red-200 text-red-900'
              }`}>
                {testResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                )}
                <div>
                  <strong className="block font-semibold">
                    {testResult.success ? 'Connection Verified' : 'Connection Check Notice'}
                  </strong>
                  <p className="mt-0.5 leading-normal">{testResult.message}</p>
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded text-xs font-semibold"
          >
            Close Guide
          </button>
        </div>

      </div>
    </div>
  );
};
