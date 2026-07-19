import React, { useRef, useState } from 'react';

export default function ImageTab({ onSubmit, disabled }) {
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef();

  const handleSubmit = () => {
    if (!file) return;
    onSubmit({ source: 'image', payload: { file } });
  };

  return (
    <div className="flex flex-col gap-4">
      {!file ? (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); setFile(e.dataTransfer.files[0]); }}
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-8 flex flex-col items-center gap-2 text-center cursor-pointer transition-colors
            ${dragOver ? 'border-zinc-900 bg-zinc-50' : 'border-zinc-200 bg-zinc-50 hover:border-zinc-400'}`}>
          <input ref={fileRef} type="file" accept=".png,.jpg,.jpeg,.webp" className="hidden"
            onChange={e => setFile(e.target.files[0] ?? null)} />
          <div className="text-sm font-medium text-zinc-900">Drop a screenshot here or click to browse</div>
          <div className="text-[10px] text-zinc-400">PNG, JPG, WebP up to 10 MB</div>
        </div>
      ) : (
        <div className="flex items-center gap-3 p-3 border border-zinc-200 rounded-lg bg-zinc-50">
          <div className="text-sm font-medium text-zinc-900 truncate flex-1">{file.name}</div>
          <button onClick={() => setFile(null)} className="text-xs text-zinc-500 hover:text-zinc-900">remove</button>
        </div>
      )}
      <div className="flex justify-end">
        <button onClick={handleSubmit} disabled={!file || disabled}
          className={`text-xs px-3 py-1.5 rounded text-white transition-colors
            ${!file || disabled ? 'bg-zinc-300 cursor-not-allowed' : 'bg-primary hover:bg-primary-hover'}`}>
          Import
        </button>
      </div>
    </div>
  );
}
