import React from 'react';

export default function FigmaTab() {
  return (
    <div className="flex flex-col items-center text-center py-8 gap-2">
      <div className="text-sm font-semibold text-zinc-900">Figma import via plugin flow</div>
      <div className="text-xs text-zinc-500 max-w-xs">
        Figma imports happen through the Designbridge Figma plugin. Connect it from the topbar “Connect Figma” button. This tab will activate once the plugin is installed.
      </div>
    </div>
  );
}
