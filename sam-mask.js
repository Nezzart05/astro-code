/* ============================================================================
   SAM-MASK.JS — pont SAM 3.1 → révélation (v1.9.26)
   ----------------------------------------------------------------------------
   Charge le parser officiel de Meta (@meta-sam/parser 0.1.0, vendorisé
   dans assets/sam/, licence SAM de Meta) et expose :
     window.SAM31.segmentPerson(apiJson)
       -> { data, w, h, left, top } du plus grand objet segmenté
          (data = raster 0/1 de w×h, à placer à left/top dans le repère
          de l'image envoyée), ou null si rien d'exploitable.
   Le module est chargé en type="module" (différé) : tant qu'il n'est
   pas prêt, window.SAM31 est absent et la révélation reste sur
   MediaPipe — aucun blocage possible.
   ============================================================================ */
import { parseImageStream, recordsOfKind, decodeMaskToRaster } from './assets/sam/index.js';

function extractText(json) {
  var out = '';
  var items = (json && json.output) || [];
  for (var i = 0; i < items.length; i++) {
    var content = items[i].content || [];
    for (var j = 0; j < content.length; j++) {
      if (content[j].text) out += content[j].text;
    }
  }
  return out;
}

async function segmentPerson(json) {
  var text = extractText(json);
  if (!text || text.indexOf('<|mask') === -1) return null;
  async function* events() {
    yield { type: 'response.output_text.delta', item_id: 'sam', output_index: 0, content_index: 0, delta: text };
    yield { type: 'response.output_text.done', item_id: 'sam', output_index: 0, content_index: 0, text: text };
    yield { type: 'response.completed' };
  }
  var parsed = parseImageStream(events());
  for await (var _snapshot of parsed) { /* drainer le flux */ }
  var result = await parsed.finalResult;
  if (!result || !result.records) return null;
  var boxes = recordsOfKind(result.records, 'box');
  var masks = recordsOfKind(result.records, 'mask');
  if (!masks.length) return null;
  var best = null, bestArea = -1;
  for (var k = 0; k < masks.length; k++) {
    var mk = masks[k], box = null;
    for (var b = 0; b < boxes.length; b++) {
      if (boxes[b].objectId === mk.objectId) box = boxes[b];
    }
    var area = box ? (box.right - box.left) * (box.bottom - box.top)
                   : mk.mask.width * mk.mask.height;
    if (area > bestArea) { bestArea = area; best = { mk: mk, box: box }; }
  }
  if (!best) return null;
  return {
    data: decodeMaskToRaster(best.mk.mask),
    w: best.mk.mask.width,
    h: best.mk.mask.height,
    left: best.box ? best.box.left : 0,
    top: best.box ? best.box.top : 0,
  };
}

window.SAM31 = { segmentPerson: segmentPerson };
