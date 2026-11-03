const DEFAULT_STYLE = {
  barColor: '#c00000', barWidth: '2px', barOffset: '5pt',
  popoverBackground: '#ffffff', popoverColor: '#1f1f1f', popoverBorder: '#d9d9d9',
  mutedColor: '#666666', shadow: '0 2px 10px rgba(0,0,0,.16)'
};
const DEFAULT_LABELS = { ins:'Inserted', del:'Deleted', moveFrom:'Moved from', moveTo:'Moved to' };

export function createChangeMarginUI(target, changeIndex, navigator, review, options = {}) {
  if (!target || !changeIndex?.items?.length || typeof target.querySelectorAll !== 'function') return null;
  const doc = target.ownerDocument || globalThis.document;
  if (!doc?.createElement) return null;
  const theme = options.style === 'none' ? null : { ...DEFAULT_STYLE, ...(typeof options.style === 'object' ? options.style : {}) };
  const labels = { ...DEFAULT_LABELS, ...(options.labels || {}) };
  const position = options.position === 'right' ? 'right' : 'left';
  const bands=[];
  const pageEntries=new Map();

  for (const item of changeIndex.items) {
    const anchors=[...target.querySelectorAll(`[data-change-id="${cssEscape(item.id)}"]`)];
    for (const [page,pageAnchors] of groupByPage(anchors)) {
      const bounds=anchorBounds(page,pageAnchors); if(!bounds) continue;
      if(!pageEntries.has(page)) pageEntries.set(page,[]);
      pageEntries.get(page).push({item,anchors:pageAnchors,...bounds});
    }
  }
  for (const [page,entries] of pageEntries) {
    const overlay=ensurePageOverlay(page,doc);
    for (const band of mergeBands(entries, 3)) {
      const bar=doc.createElement('button');
      bar.type='button'; bar.className='docx-change-margin-bar';
      bar.dataset.changeId=band.entries[0].item.id;
      bar.dataset.changeIds=band.entries.map(e=>e.item.id).join(' ');
      bar.dataset.changeCount=String(band.entries.length);
      bar.setAttribute?.('aria-label', band.entries.map(e=>`${labels[e.item.kind]||e.item.kind}: ${e.item.text||''}`).join('; '));
      positionBandBar(bar,band,position,theme);
      const record={page,overlay,bar,entries:band.entries}; bands.push(record);
      bar.addEventListener?.('click',event=>{event?.stopPropagation?.(); selectBand(record,{openPopover:true});});
      overlay.appendChild(bar);
    }
  }

  let selectedId=null;
  function select(id,{openPopover=true}={}) {
    const item=changeIndex.items.find(e=>e.id===String(id)); if(!item) return null;
    const band=bands.find(b=>b.entries.some(e=>e.item.id===item.id));
    selectedId=item.id;
    navigator?.goTo?.(item.id,{scroll:false,markCurrent:true});
    if(review?.selectedId!==item.id) review?.select?.(item.id,{scroll:false,markCurrent:true});
    updateSelectedBars(bands,item.id,theme); closePopovers(bands);
    if(openPopover && band) openPopoverForBand(band,doc,labels,theme,position,item.id);
    return item;
  }
  function selectBand(band,{openPopover=true}={}) {
    const item=band.entries[0]?.item; if(!item)return null;
    selectedId=item.id;
    navigator?.goTo?.(item.id,{scroll:false,markCurrent:true});
    if(review?.selectedId!==item.id) review?.select?.(item.id,{scroll:false,markCurrent:true});
    updateSelectedBars(bands,item.id,theme); closePopovers(bands);
    if(openPopover) openPopoverForBand(band,doc,labels,theme,position,item.id);
    return item;
  }
  return {
    get selectedId(){return selectedId;}, select,
    close(){closePopovers(bands);},
    destroy(){for(const b of bands)b.bar.remove?.(); closePopovers(bands); for(const {overlay} of bands){if(!overlay.children?.length)overlay.remove?.();} bands.length=0;}
  };
}

function mergeBands(entries,gap=2){
  const sorted=[...entries].sort((a,b)=>a.top-b.top || a.bottom-b.bottom), out=[];
  for(const entry of sorted){
    const last=out[out.length-1];
    if(last && entry.top<=last.bottom+gap){last.bottom=Math.max(last.bottom,entry.bottom);last.entries.push(entry);}
    else out.push({top:entry.top,bottom:entry.bottom,entries:[entry]});
  }
  return out;
}
function anchorBounds(page,anchors){
  const pr=rect(page), rs=anchors.map(rect).filter(Boolean); if(!pr||!rs.length)return null;
  return {top:Math.max(0,Math.min(...rs.map(r=>r.top))-pr.top),bottom:Math.min(pr.height,Math.max(...rs.map(r=>r.bottom))-pr.top)};
}
function groupByPage(anchors){const m=new Map();for(const a of anchors){const p=closestPage(a);if(!p)continue;if(!m.has(p))m.set(p,[]);m.get(p).push(a);}return m;}
function closestPage(node){if(typeof node?.closest==='function')return node.closest('.docx-page');let n=node;while(n){if(String(n.className||'').split(/\s+/).includes('docx-page'))return n;n=n.parentNode||n.parentElement;}return null;}
function ensurePageOverlay(page,doc){let o=page.querySelector?.(':scope > .docx-change-margin-overlay');if(o)return o;o=doc.createElement('div');o.className='docx-change-margin-overlay';o.dataset.changeMarginOverlay='true';Object.assign(o.style,{position:'absolute',left:'0',top:'0',width:'100%',height:'100%',pointerEvents:'none',zIndex:'40',overflow:'visible'});page.appendChild(o);return o;}
function positionBandBar(bar,band,position,theme){Object.assign(bar.style,{position:'absolute',top:`${band.top}px`,height:`${Math.max(12,band.bottom-band.top)}px`,width:theme?.barWidth||DEFAULT_STYLE.barWidth,padding:'0',margin:'0',border:'0',borderRadius:'1px',background:theme?.barColor||DEFAULT_STYLE.barColor,pointerEvents:'auto',cursor:'pointer',zIndex:'1'});bar.style[position]=theme?.barOffset||DEFAULT_STYLE.barOffset;}
function openPopoverForBand(band,doc,labels,theme,position,selectedId){
  const pop=doc.createElement('aside');pop.className='docx-change-popover';pop.dataset.changePopover=band.entries.map(e=>e.item.id).join(' ');
  for(const {item} of band.entries){const block=doc.createElement('div');block.className='docx-change-popover__change';block.dataset.changeId=item.id;const h=doc.createElement('strong');h.className='docx-change-popover__kind';h.textContent=labels[item.kind]||item.kind;block.appendChild(h);if(item.text){const t=doc.createElement('div');t.className='docx-change-popover__text';t.textContent=item.text;block.appendChild(t);}if(item.author||item.date){const m=doc.createElement('div');m.className='docx-change-popover__meta';m.textContent=[item.author,item.date].filter(Boolean).join(' · ');m.style.color=theme?.mutedColor||DEFAULT_STYLE.mutedColor;block.appendChild(m);}if(item.id===selectedId)block.dataset.changeCurrent='true';pop.appendChild(block);}
  Object.assign(pop.style,{position:'absolute',top:`${Math.max(0,band.top-4)}px`,width:'190px',padding:'10px 12px',borderRadius:'6px',background:theme?.popoverBackground||DEFAULT_STYLE.popoverBackground,color:theme?.popoverColor||DEFAULT_STYLE.popoverColor,border:`1px solid ${theme?.popoverBorder||DEFAULT_STYLE.popoverBorder}`,boxShadow:theme?.shadow||DEFAULT_STYLE.shadow,fontFamily:'-apple-system, BlinkMacSystemFont, "Segoe UI", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif',fontSize:'12px',lineHeight:'1.45',pointerEvents:'auto',zIndex:'4'});pop.style[position]='12pt';
  for(let i=1;i<pop.children.length;i++){pop.children[i].style.marginTop='9px';pop.children[i].style.paddingTop='9px';pop.children[i].style.borderTop=`1px solid ${theme?.popoverBorder||DEFAULT_STYLE.popoverBorder}`;}
  band.overlay.appendChild(pop);
}
function updateSelectedBars(bands,id,theme){for(const b of bands){const active=b.entries.some(e=>e.item.id===id);b.bar.dataset.changeCurrent=active?'true':'false';b.bar.style.width=active?'3px':(theme?.barWidth||DEFAULT_STYLE.barWidth);}}
function closePopovers(bands){const seen=new Set();for(const b of bands){if(seen.has(b.overlay))continue;seen.add(b.overlay);for(const n of b.overlay.querySelectorAll?.('.docx-change-popover')||[])n.remove?.();}}
function rect(n){if(typeof n?.getBoundingClientRect!=='function')return null;const r=n.getBoundingClientRect();return{top:+r.top||0,bottom:+r.bottom||0,height:+r.height||0};}
function cssEscape(v){return String(v).replace(/(["\\])/g,'\\$1');}
