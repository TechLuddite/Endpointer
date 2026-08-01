import React, { useState } from 'react';
import { FolderGit2, History, Play, Trash2, Download, Upload, Plus, FileJson, Check, Database } from 'lucide-react';
import { CollectionItem, RequestHistoryItem, RequestConfig } from '../types';

interface CollectionsManagerProps {
  collections: CollectionItem[];
  history: RequestHistoryItem[];
  onSelectRequestForPlayground: (config: RequestConfig) => void;
  onClearHistory: () => void;
  onSaveCollections: (collections: CollectionItem[]) => void;
}

export const CollectionsManager: React.FC<CollectionsManagerProps> = ({
  collections,
  history,
  onSelectRequestForPlayground,
  onClearHistory,
  onSaveCollections,
}) => {
  const [activeTab, setActiveTab] = useState<'collections' | 'history'>('collections');
  const [newColName, setNewColName] = useState('');
  const [showCreateColModal, setShowCreateColModal] = useState(false);
  const [importedStatus, setImportedStatus] = useState(false);

  const handleCreateCollection = () => {
    if (!newColName.trim()) return;
    const newCol: CollectionItem = {
      id: `col-${Date.now()}`,
      name: newColName.trim(),
      description: 'Custom user API collection',
      createdAt: Date.now(),
      requests: [],
    };
    onSaveCollections([...collections, newCol]);
    setNewColName('');
    setShowCreateColModal(false);
  };

  const handleDeleteCollection = (id: string) => {
    onSaveCollections(collections.filter((c) => c.id !== id));
  };

  const handleExportCollections = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(collections, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `endpointer_collections_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleImportCollections = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (Array.isArray(parsed)) {
          onSaveCollections([...collections, ...parsed]);
          setImportedStatus(true);
          setTimeout(() => setImportedStatus(false), 3000);
        }
      } catch {
        alert('Failed to parse collection JSON file.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs font-semibold mb-2">
            <FolderGit2 className="w-3.5 h-3.5 text-purple-400" />
            <span>Collections & Request History</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-100">
            Organize API Suites & Review Execution Logs
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Group endpoint tests into exportable collections and reload past REST executions.
          </p>
        </div>

        {/* Tab Switcher & Export/Import */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab('collections')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'collections'
                  ? 'bg-purple-950 text-purple-300 border border-purple-800'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FolderGit2 className="w-3.5 h-3.5" />
              <span>Collections ({collections.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'history'
                  ? 'bg-purple-950 text-purple-300 border border-purple-800'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>History ({history.length})</span>
            </button>
          </div>

          <button
            onClick={handleExportCollections}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-xl text-xs font-semibold transition-all"
            title="Export Collections to JSON"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export JSON</span>
          </button>

          <label
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-xl text-xs font-semibold transition-all cursor-pointer"
            title="Import Collections from JSON"
          >
            <Upload className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Import</span>
            <input type="file" accept=".json" onChange={handleImportCollections} className="hidden" />
          </label>
        </div>
      </div>

      {importedStatus && (
        <div className="p-3 bg-emerald-950/80 border border-emerald-800 rounded-xl text-emerald-300 text-xs font-mono flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>Collections imported successfully!</span>
        </div>
      )}

      {/* COLLECTIONS VIEW */}
      {activeTab === 'collections' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-base text-slate-200">My Collections</h3>
            <button
              onClick={() => setShowCreateColModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-purple-600/20 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Collection</span>
            </button>
          </div>

          {/* Create Modal */}
          {showCreateColModal && (
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
              <h4 className="font-bold text-xs text-slate-200 uppercase tracking-wider">Create New Collection</h4>
              <input
                type="text"
                value={newColName}
                onChange={(e) => setNewColName(e.target.value)}
                placeholder="Collection Name (e.g., Weather API Tests)..."
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-slate-200 focus:outline-none focus:border-purple-500"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setShowCreateColModal(false)}
                  className="px-3 py-1.5 bg-slate-800 text-slate-400 rounded-lg text-xs"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateCollection}
                  className="px-3.5 py-1.5 bg-purple-600 text-white font-semibold rounded-lg text-xs"
                >
                  Create
                </button>
              </div>
            </div>
          )}

          {collections.length === 0 ? (
            <div className="text-center py-16 bg-slate-900/60 border border-slate-800 rounded-2xl text-slate-500 space-y-2">
              <FolderGit2 className="w-10 h-10 text-slate-700 mx-auto" />
              <p className="text-sm font-bold text-slate-400">No Saved Collections</p>
              <p className="text-xs text-slate-600">Create a collection above or save requests from the REST Playground.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {collections.map((col) => (
                <div key={col.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FolderGit2 className="w-4 h-4 text-purple-400" />
                      <h4 className="font-bold text-sm text-slate-200">{col.name}</h4>
                    </div>
                    <button
                      onClick={() => handleDeleteCollection(col.id)}
                      className="text-slate-500 hover:text-rose-400 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <p className="text-xs text-slate-400">{col.description || 'Saved collection'}</p>

                  <div className="space-y-2 pt-2 border-t border-slate-800">
                    <span className="text-[11px] font-mono text-slate-500 uppercase">Requests ({col.requests.length}):</span>
                    {col.requests.length === 0 ? (
                      <p className="text-xs text-slate-600 italic">No requests in this collection yet.</p>
                    ) : (
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {col.requests.map((req, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between p-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono"
                          >
                            <div className="flex items-center gap-2 max-w-[70%] truncate">
                              <span className="font-bold text-cyan-400">{req.method}</span>
                              <span className="text-slate-300 truncate">{req.url}</span>
                            </div>
                            <button
                              onClick={() => onSelectRequestForPlayground(req)}
                              className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-cyan-400 rounded text-[11px] font-semibold"
                            >
                              Load
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* HISTORY VIEW */}
      {activeTab === 'history' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="font-bold text-base text-slate-200 flex items-center gap-2">
              <History className="w-4 h-4 text-purple-400" />
              <span>Execution Logs ({history.length})</span>
            </h3>
            {history.length > 0 && (
              <button
                onClick={onClearHistory}
                className="text-xs text-rose-400 hover:text-rose-300 font-semibold"
              >
                Clear History
              </button>
            )}
          </div>

          {history.length === 0 ? (
            <div className="text-center py-16 text-slate-500 space-y-2">
              <History className="w-10 h-10 text-slate-700 mx-auto" />
              <p className="text-sm font-bold text-slate-400">No Execution History</p>
              <p className="text-xs text-slate-600">Send requests in the Playground to record execution history.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {history.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono hover:border-slate-700 transition-all"
                >
                  <div className="flex items-center gap-3 max-w-[75%]">
                    <span className="font-bold text-cyan-400 px-2 py-0.5 bg-slate-900 rounded border border-slate-800">
                      {item.config.method}
                    </span>
                    <span className="text-slate-200 truncate">{item.config.url}</span>
                    {item.response && (
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          item.response.ok
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : 'bg-rose-950 text-rose-400 border border-rose-800'
                        }`}
                      >
                        {item.response.status} ({item.response.duration}ms)
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-slate-500 hidden sm:inline">
                      {new Date(item.timestamp).toLocaleTimeString()}
                    </span>
                    <button
                      onClick={() => onSelectRequestForPlayground(item.config)}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-400 rounded-lg font-semibold text-xs"
                    >
                      Re-run
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
