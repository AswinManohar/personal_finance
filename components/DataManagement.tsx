import React, { useState, useEffect } from 'react';
import { Card } from './ui/Card';
import { Download, Upload, Database, Trash2, FileSpreadsheet, Save, Link as LinkIcon, AlertCircle, CheckCircle, RefreshCw } from 'lucide-react';
import { Expense, PortfolioAsset, Stock, ExpenseCategory, GoogleSheetsState } from '../types';

interface DataManagementProps {
  expenses: Expense[];
  portfolio: PortfolioAsset[];
  stocks: Stock[];
  sheetState: GoogleSheetsState;
  setExpenses: (data: Expense[]) => void;
  setPortfolio: (data: PortfolioAsset[]) => void;
  setStocks: (data: Stock[]) => void;
  setSheetState: (data: GoogleSheetsState) => void;
  clearAllData: () => void;
}

declare global {
  interface Window {
    google: any;
  }
}

export const DataManagement: React.FC<DataManagementProps> = ({
  expenses, portfolio, stocks, sheetState, setExpenses, setPortfolio, setStocks, setSheetState, clearAllData
}) => {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [tokenClient, setTokenClient] = useState<any>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    const storedId = localStorage.getItem('google_client_id');
    // Check if window.google is available and storedId exists to prevent crash
    if (window.google && storedId) {
      try {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: storedId,
          scope: 'https://www.googleapis.com/auth/spreadsheets',
          callback: (response: any) => {
            if (response.access_token) {
              setAccessToken(response.access_token);
              setStatusMsg({ type: 'success', text: 'Connected to Google!' });
            } else {
              setStatusMsg({ type: 'error', text: 'Failed to connect.' });
            }
          },
        });
        setTokenClient(client);
      } catch (e) {
        console.error("Failed to init token client", e);
      }
    }
  }, []);

  const [clientIdInput, setClientIdInput] = useState(localStorage.getItem('google_client_id') || '');

  const saveClientId = () => {
    localStorage.setItem('google_client_id', clientIdInput);
    window.location.reload(); // Reload to re-init client
  };

  const handleConnect = () => {
    if (!clientIdInput) {
        setStatusMsg({ type: 'error', text: 'Please enter a Google Client ID first.' });
        return;
    }
    
    // Use existing client if available
    if (tokenClient) {
      tokenClient.requestAccessToken();
      return;
    }

    // Lazy initialization if client wasn't ready on mount (e.g. script loaded late or ID just entered)
    if (window.google) {
        try {
            const client = window.google.accounts.oauth2.initTokenClient({
                client_id: clientIdInput,
                scope: 'https://www.googleapis.com/auth/spreadsheets',
                callback: (response: any) => {
                    if (response.access_token) {
                        setAccessToken(response.access_token);
                        setStatusMsg({ type: 'success', text: 'Connected to Google!' });
                    } else {
                        setStatusMsg({ type: 'error', text: 'Failed to connect.' });
                    }
                },
            });
            setTokenClient(client);
            client.requestAccessToken();
        } catch (e: any) {
            console.error(e);
            setStatusMsg({ type: 'error', text: 'Error initializing Google Sign-In: ' + e.message });
        }
    } else {
        setStatusMsg({ type: 'error', text: 'Google Identity Services script not loaded. Please refresh.' });
    }
  };

  const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
    if (!accessToken) throw new Error("Not authenticated");
    return fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
  };

  const handleSheetSyncUpload = async () => {
    if (!accessToken || !sheetState.spreadsheetId) return;
    setIsSyncing(true);
    setStatusMsg(null);

    try {
      // 1. Ensure Tabs Exist
      const spreadsheetData = await fetchWithAuth(`https://sheets.googleapis.com/v4/spreadsheets/${sheetState.spreadsheetId}`);
      const sheetMeta = await spreadsheetData.json();
      
      if (sheetMeta.error) throw new Error(sheetMeta.error.message);

      const existingTitles = sheetMeta.sheets.map((s: any) => s.properties.title);
      const requiredSheets = ['Expenses', 'Portfolio', 'Stocks'];
      const requests = [];

      requiredSheets.forEach(title => {
        if (!existingTitles.includes(title)) {
          requests.push({ addSheet: { properties: { title } } });
        }
      });

      if (requests.length > 0) {
        await fetchWithAuth(`https://sheets.googleapis.com/v4/spreadsheets/${sheetState.spreadsheetId}:batchUpdate`, {
          method: 'POST',
          body: JSON.stringify({ requests })
        });
      }

      // 2. Prepare Data
      const expenseRows = [['Name', 'Category', 'Amount'], ...expenses.map(e => [e.name, e.category, e.amount])];
      const portfolioRows = [['Name', 'Type', 'Value', 'Monthly Inv', 'Return %', 'TER %', 'Tax %'], ...portfolio.map(p => [p.name, p.type, p.currentValue, p.monthlyInvestment, p.expectedReturn, p.expenseRatio, p.taxRate])];
      const stockRows = [['Symbol', 'Quantity', 'Buy Price'], ...stocks.map(s => [s.symbol, s.quantity, s.buyPrice])];

      // 3. Clear & Write Data
      const updateBody = {
        valueInputOption: 'USER_ENTERED',
        data: [
            { range: 'Expenses!A1', values: expenseRows },
            { range: 'Portfolio!A1', values: portfolioRows },
            { range: 'Stocks!A1', values: stockRows }
        ]
      };

      const updateRes = await fetchWithAuth(`https://sheets.googleapis.com/v4/spreadsheets/${sheetState.spreadsheetId}/values:batchUpdate`, {
        method: 'POST',
        body: JSON.stringify(updateBody)
      });

      if (!updateRes.ok) throw new Error('Failed to update sheets');

      setSheetState({ ...sheetState, lastSynced: new Date().toLocaleString() });
      setStatusMsg({ type: 'success', text: 'Data uploaded successfully!' });

    } catch (error: any) {
      console.error(error);
      setStatusMsg({ type: 'error', text: error.message || 'Sync failed' });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSheetSyncDownload = async () => {
    if (!accessToken || !sheetState.spreadsheetId) return;
    setIsSyncing(true);
    setStatusMsg(null);

    try {
        const ranges = ['Expenses!A:C', 'Portfolio!A:G', 'Stocks!A:C'];
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetState.spreadsheetId}/values:batchGet?majorDimension=ROWS&${ranges.map(r => `ranges=${r}`).join('&')}`;
        
        const res = await fetchWithAuth(url);
        const json = await res.json();
        
        if (json.error) throw new Error(json.error.message);

        const valueRanges = json.valueRanges;
        
        // Process Expenses
        if (valueRanges[0].values && valueRanges[0].values.length > 1) {
            const newExpenses: Expense[] = valueRanges[0].values.slice(1).map((row: any) => ({
                id: crypto.randomUUID(),
                name: row[0],
                category: row[1] as ExpenseCategory,
                amount: parseFloat(row[2]) || 0
            }));
            setExpenses(newExpenses);
        }

        // Process Portfolio
        if (valueRanges[1].values && valueRanges[1].values.length > 1) {
             const newPortfolio: PortfolioAsset[] = valueRanges[1].values.slice(1).map((row: any) => ({
                id: crypto.randomUUID(),
                name: row[0],
                type: row[1] as any,
                currentValue: parseFloat(row[2]) || 0,
                monthlyInvestment: parseFloat(row[3]) || 0,
                expectedReturn: parseFloat(row[4]) || 0,
                expenseRatio: parseFloat(row[5]) || 0,
                taxRate: parseFloat(row[6]) || 0,
            }));
            setPortfolio(newPortfolio);
        }

        // Process Stocks
        if (valueRanges[2].values && valueRanges[2].values.length > 1) {
             const newStocks: Stock[] = valueRanges[2].values.slice(1).map((row: any) => ({
                id: crypto.randomUUID(),
                symbol: row[0],
                quantity: parseFloat(row[1]) || 0,
                buyPrice: parseFloat(row[2]) || 0,
            }));
            setStocks(newStocks);
        }

        setSheetState({ ...sheetState, lastSynced: new Date().toLocaleString() });
        setStatusMsg({ type: 'success', text: 'Data downloaded successfully!' });

    } catch (error: any) {
        console.error(error);
        setStatusMsg({ type: 'error', text: error.message || 'Download failed' });
    } finally {
        setIsSyncing(false);
    }
  };

  // -- Existing CSV Functions --
  const downloadCSV = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportExpenses = () => {
    const headers = ['Name,Category,Amount'];
    const rows = expenses.map(e => `"${e.name}","${e.category}",${e.amount}`);
    downloadCSV([headers, ...rows].join('\n'), 'expenses.csv');
  };

  const exportPortfolio = () => {
    const headers = ['Name,Type,Current Value,Monthly Investment,Return %,TER %,Tax Rate %'];
    const rows = portfolio.map(p => `"${p.name}","${p.type}",${p.currentValue},${p.monthlyInvestment},${p.expectedReturn},${p.expenseRatio},${p.taxRate}`);
    downloadCSV([headers, ...rows].join('\n'), 'portfolio.csv');
  };

  const exportStocks = () => {
    const headers = ['Symbol,Quantity,Buy Price'];
    const rows = stocks.map(s => `"${s.symbol}",${s.quantity},${s.buyPrice}`);
    downloadCSV([headers, ...rows].join('\n'), 'stocks.csv');
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>, type: 'expenses' | 'portfolio' | 'stocks') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;
      
      const lines = text.split('\n');
      const dataRows = lines.slice(1).filter(line => line.trim() !== '');
      
      if (type === 'expenses') {
        const newExpenses: Expense[] = [];
        dataRows.forEach(row => {
          const parts = row.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || [];
          if (parts.length >= 3) {
             const name = parts[0].replace(/"/g, '');
             const category = parts[1].replace(/"/g, '') as ExpenseCategory;
             const amount = parseFloat(parts[2]);
             if (name && !isNaN(amount)) newExpenses.push({ id: crypto.randomUUID(), name, category, amount });
          }
        });
        if (newExpenses.length > 0) setExpenses(newExpenses);
      } 
      else if (type === 'portfolio') {
         const newAssets: PortfolioAsset[] = dataRows.map(row => {
            const cols = row.split(',').map(c => c.replace(/"/g, ''));
            return {
               id: crypto.randomUUID(),
               name: cols[0],
               type: cols[1] as any,
               currentValue: parseFloat(cols[2]) || 0,
               monthlyInvestment: parseFloat(cols[3]) || 0,
               expectedReturn: parseFloat(cols[4]) || 0,
               expenseRatio: parseFloat(cols[5]) || 0,
               taxRate: parseFloat(cols[6]) || 0
            };
         });
         setPortfolio(newAssets);
      }
      else if (type === 'stocks') {
         const newStocks: Stock[] = dataRows.map(row => {
            const cols = row.split(',').map(c => c.replace(/"/g, ''));
            return {
               id: crypto.randomUUID(),
               symbol: cols[0],
               quantity: parseFloat(cols[1]) || 0,
               buyPrice: parseFloat(cols[2]) || 0,
            };
         });
         setStocks(newStocks);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-3 bg-indigo-100 text-indigo-700 rounded-lg">
          <Database size={24} />
        </div>
        <div>
           <h2 className="text-2xl font-bold text-slate-900">Data Management</h2>
           <p className="text-slate-500">Manage your data locally, export to CSV, or sync with Google Sheets.</p>
        </div>
      </div>

      {/* Google Sheets Integration */}
      <Card className="border-green-100 bg-green-50/50">
         <div className="flex items-start justify-between mb-4">
             <div className="flex items-center gap-2">
                 <FileSpreadsheet className="text-green-600" size={24} />
                 <h3 className="text-lg font-bold text-slate-900">Google Sheets Sync</h3>
             </div>
             {sheetState.lastSynced && (
                 <span className="text-xs text-slate-500 bg-white px-2 py-1 rounded border border-slate-200">
                    Last Synced: {sheetState.lastSynced}
                 </span>
             )}
         </div>

         <div className="space-y-4">
            {!accessToken ? (
                <div className="space-y-3">
                    <p className="text-sm text-slate-600">
                        To sync your data, you need to provide a Google Cloud Client ID (for OAuth) and then sign in.
                        <br/><span className="text-xs text-slate-400">Note: The Client ID is stored locally in your browser.</span>
                    </p>
                    <div className="flex gap-2">
                        <input 
                            type="text" 
                            placeholder="Enter Google Client ID" 
                            value={clientIdInput}
                            onChange={(e) => setClientIdInput(e.target.value)}
                            className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm"
                        />
                        <button onClick={saveClientId} className="text-xs bg-slate-200 px-3 py-2 rounded hover:bg-slate-300">Save</button>
                    </div>
                    <button 
                        onClick={handleConnect}
                        className="bg-white text-slate-700 border border-slate-300 px-4 py-2 rounded-lg font-medium hover:bg-slate-50 flex items-center gap-2 shadow-sm"
                    >
                        <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="" />
                        Sign in with Google
                    </button>
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="flex items-center gap-2 text-green-700 text-sm font-medium bg-green-100 p-2 rounded">
                        <CheckCircle size={16} /> Connected to Google
                    </div>
                    
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Spreadsheet ID</label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={sheetState.spreadsheetId || ''}
                                onChange={(e) => setSheetState({...sheetState, spreadsheetId: e.target.value})}
                                placeholder="Paste ID from URL: docs.google.com/spreadsheets/d/[ID]/edit"
                                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none text-sm"
                            />
                            <a 
                                href="https://sheets.new" 
                                target="_blank" 
                                rel="noreferrer"
                                className="px-3 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 flex items-center gap-1 text-sm"
                                title="Create new sheet"
                            >
                                <PlusIcon size={16} /> New
                            </a>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                            Ensure the sheet is empty or has "Expenses", "Portfolio", "Stocks" tabs.
                        </p>
                    </div>

                    <div className="flex gap-3">
                         <button 
                            onClick={handleSheetSyncUpload}
                            disabled={isSyncing || !sheetState.spreadsheetId}
                            className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
                        >
                            {isSyncing ? <RefreshCw className="animate-spin" size={18} /> : <Upload size={18} />}
                            Upload to Sheet
                        </button>
                        <button 
                            onClick={handleSheetSyncDownload}
                            disabled={isSyncing || !sheetState.spreadsheetId}
                            className="flex-1 bg-white text-green-700 border border-green-200 px-4 py-2 rounded-lg hover:bg-green-50 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
                        >
                            {isSyncing ? <RefreshCw className="animate-spin" size={18} /> : <Download size={18} />}
                            Download from Sheet
                        </button>
                    </div>
                </div>
            )}

            {statusMsg && (
                <div className={`p-3 rounded-lg text-sm flex items-center gap-2 ${statusMsg.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {statusMsg.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                    {statusMsg.text}
                </div>
            )}
         </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Expenses CSV */}
        <Card title="Expenses CSV">
          <div className="space-y-4">
            <div className="flex gap-2">
              <button onClick={exportExpenses} className="flex-1 flex items-center justify-center gap-2 bg-slate-50 text-slate-700 border border-slate-200 px-3 py-2 rounded-lg hover:bg-slate-100 text-sm">
                <Download size={14} /> Export
              </button>
              <label className="flex-1 flex items-center justify-center gap-2 bg-white text-slate-700 border border-slate-200 px-3 py-2 rounded-lg hover:bg-slate-50 cursor-pointer text-sm">
                <Upload size={14} /> Import
                <input type="file" accept=".csv" className="hidden" onChange={(e) => handleImport(e, 'expenses')} />
              </label>
            </div>
            <div className="text-xs text-slate-400 text-center">{expenses.length} records</div>
          </div>
        </Card>

        {/* Portfolio CSV */}
        <Card title="Portfolio CSV">
          <div className="space-y-4">
            <div className="flex gap-2">
              <button onClick={exportPortfolio} className="flex-1 flex items-center justify-center gap-2 bg-slate-50 text-slate-700 border border-slate-200 px-3 py-2 rounded-lg hover:bg-slate-100 text-sm">
                <Download size={14} /> Export
              </button>
              <label className="flex-1 flex items-center justify-center gap-2 bg-white text-slate-700 border border-slate-200 px-3 py-2 rounded-lg hover:bg-slate-50 cursor-pointer text-sm">
                <Upload size={14} /> Import
                <input type="file" accept=".csv" className="hidden" onChange={(e) => handleImport(e, 'portfolio')} />
              </label>
            </div>
            <div className="text-xs text-slate-400 text-center">{portfolio.length} assets</div>
          </div>
        </Card>

        {/* Stocks CSV */}
        <Card title="Stocks CSV">
          <div className="space-y-4">
            <div className="flex gap-2">
              <button onClick={exportStocks} className="flex-1 flex items-center justify-center gap-2 bg-slate-50 text-slate-700 border border-slate-200 px-3 py-2 rounded-lg hover:bg-slate-100 text-sm">
                <Download size={14} /> Export
              </button>
              <label className="flex-1 flex items-center justify-center gap-2 bg-white text-slate-700 border border-slate-200 px-3 py-2 rounded-lg hover:bg-slate-50 cursor-pointer text-sm">
                <Upload size={14} /> Import
                <input type="file" accept=".csv" className="hidden" onChange={(e) => handleImport(e, 'stocks')} />
              </label>
            </div>
            <div className="text-xs text-slate-400 text-center">{stocks.length} holdings</div>
          </div>
        </Card>
      </div>

      <Card className="border-red-100 bg-red-50">
        <div className="flex items-center justify-between">
          <div>
             <h3 className="text-lg font-semibold text-red-900">Reset Database</h3>
             <p className="text-red-700 text-sm">Delete all stored data from browser.</p>
          </div>
          <button 
            onClick={() => {
              if (confirm('Are you sure? This cannot be undone.')) clearAllData();
            }}
            className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
          >
            <Trash2 size={18} /> Clear
          </button>
        </div>
      </Card>
    </div>
  );
};

const PlusIcon = ({ size }: { size: number }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
);