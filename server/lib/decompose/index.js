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
// @property {?{x:number,y:number,w:number,h:number}} bounds   normiert 0..1
// @property {?{base64:string, media_type:string}} visual      Crop (PNG)
// @property {?{html:string, css:string}} structure            URL später
import { imageDecomposer } from './imageDecomposer.js';

const REGISTRY = {
  image: imageDecomposer,
  // 'url': urlDecomposer   // Scheibe ②
};

export function getDecomposer(sourceKind) {
  const d = REGISTRY[sourceKind];
  if (!d) throw new Error(`kein Decomposer für Quelle "${sourceKind}"`);
  return d;
}
