// Die "Naht": quellen-agnostischer Decompose-Contract. Jeder Decomposer
// implementiert decompose(source, inventory) -> Promise<Segment[]>.
// Downstream (Interpret, Library) konsumiert Segmente und weiß nie, woher.
//
// @typedef {Object} Segment
// @property {string} id
// @property {string} label
// @property {string} kind            'atomic' | 'component' | 'pattern'
// @property {string} [confidence]
// @property {string} [notes]
// @property {?{x:number,y:number,w:number,h:number}|{selector:string}} bounds   Bild: normiert 0..1 · URL: DOM-Pfad
// @property {?{base64:string, media_type:string}} visual      Crop (PNG)
// @property {?{html:string, css:string}} structure            URL: echtes Markup
import { imageDecomposer } from './imageDecomposer.js';
import { urlDecomposer } from './urlDecomposer.js';

const REGISTRY = {
  image: imageDecomposer,
  url: urlDecomposer,
};

export function getDecomposer(sourceKind) {
  const d = REGISTRY[sourceKind];
  if (!d) throw new Error(`kein Decomposer für Quelle "${sourceKind}"`);
  return d;
}
