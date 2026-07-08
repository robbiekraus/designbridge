import React, { useState, useEffect, useRef } from 'react';
import ImportModalShell from './ImportModalShell.jsx';
import ImportProgress from './ImportProgress.jsx';
import ImportSuccess from './ImportSuccess.jsx';
import ImageTab from './tabs/ImageTab.jsx';
import UrlTab from './tabs/UrlTab.jsx';
import RepoTab from './tabs/RepoTab.jsx';
import FigmaTab from './tabs/FigmaTab.jsx';
import { useImportSession } from '../../lib/useImportSession.js';

const TABS = [
  { id: 'image', label: 'Image' },
  { id: 'url', label: 'URL' },
  { id: 'repo', label: 'Repo' },
  { id: 'figma', label: 'Figma', disabled: true },
];

export default function ImportModal({ open, onClose, onImported, onOpenLibrary }) {
  const [activeTab, setActiveTab] = useState('image');
  const { stage, result, error, submit, reset } = useImportSession();

  // Jedes erfolgreiche Import-Ergebnis GENAU EINMAL nach oben melden — auch wenn
  // der Parent bei jedem Render eine neue onImported-Referenz übergibt. Ohne diese
  // Guard feuerte der Effekt bei jedem Re-Render erneut; seit handleImported ein
  // neues Result-Objekt erzeugt (interpretPending), führte das zur Endlosschleife.
  const emittedFor = useRef(null);
  useEffect(() => {
    if (stage === 'success' && result && emittedFor.current !== result) {
      emittedFor.current = result;
      try { localStorage.setItem('designbridge.hasImported', '1'); } catch {}
      onImported?.(result);
    }
  }, [stage, result, onImported]);

  const handleClose = () => {
    reset();
    onClose?.();
  };

  let body;
  let title = 'Start a new import';
  let footer = null;

  if (stage === 'submitting') {
    body = <ImportProgress source={activeTab} />;
    title = 'Importing…';
  } else if (stage === 'success' && result) {
    body = <ImportSuccess result={result} onNewImport={reset} onOpenLibrary={onOpenLibrary} />;
    title = 'Import complete';
  } else if (stage === 'error') {
    body = (
      <div className="flex flex-col gap-3 p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-800">
        <div><strong>Import failed:</strong> {error}</div>
        <button onClick={reset}
          className="text-xs px-3 py-1.5 border border-red-300 rounded text-red-800 hover:bg-red-100 w-fit">
          Try again
        </button>
      </div>
    );
    title = 'Something went wrong';
  } else if (activeTab === 'image') {
    body = <ImageTab onSubmit={submit} />;
  } else if (activeTab === 'url') {
    body = <UrlTab onSubmit={submit} />;
  } else if (activeTab === 'repo') {
    body = <RepoTab onSubmit={submit} />;
  } else {
    body = <FigmaTab />;
  }

  const showTabs = stage !== 'submitting' && stage !== 'success' && stage !== 'error';

  return (
    <ImportModalShell
      open={open}
      title={title}
      tabs={showTabs ? TABS : null}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      onClose={handleClose}
      footer={footer}
    >
      {body}
    </ImportModalShell>
  );
}
