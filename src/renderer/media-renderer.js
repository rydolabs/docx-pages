import { applyBoxStyle } from "./css-renderer.js";
import { renderTextBlock } from "./text-renderer.js";
import { renderTable } from "./table-renderer.js";

export function renderMedia(block, doc=document, resources={}, renderOptions={}) { const el=doc.createElement("div"); el.className=`docx-media docx-${block.type}`; applyBoxStyle(el,block); el.style.boxSizing="border-box"; const node=block.source||block; applyVisual(el, node.visual || block.visual); paint(el,node,doc,resources); paintTextbox(el,block.textBox,doc,renderOptions); paintFallback(el,node,doc); return el; }
export function renderInlineMedia(fragment,doc=document,resources={},renderOptions={}) { const el=doc.createElement("span"); const node=fragment.media||{}; el.className=`docx-inline-media docx-${node.type||"media"}`; el.style.display="inline-block"; el.style.position="relative"; el.style.width=`${fragment.widthPt||0}pt`; el.style.height=`${fragment.heightPt||fragment.lineHeightPt||0}pt`; el.style.verticalAlign="bottom"; el.style.boxSizing="border-box"; applyVisual(el,node.visual); paint(el,node,doc,resources); paintTextbox(el,fragment.textBox||node.textBoxLayout,doc,renderOptions); paintFallback(el,node,doc); return el; }
function paint(container,node,doc,resources){
  const resource=resources?.[node.resourceKey]||node.resource;
  if(resource?.chart){
    if(paintChart(container, resource.chart, doc)) return;
  }
  if(!resource?.data||!resource.contentType?.startsWith("image/")) return;
  const img=doc.createElement("img");
  img.src=dataUri(resource.data,resource.contentType);
  const description=node.docProperties?.description || node.docProperties?.title || "";
  if(description) img.alt=description;
  if(node.docProperties?.title) img.title=node.docProperties.title;
  applyImageCrop(container,img,node.visual?.crop);
  img.style.display="block";
  container.appendChild(img);
}

function paintChart(container, chart, doc){
  if(chart?.type!=="bar" || chart.direction!=="col" || chart.grouping!=="clustered" || !chart.series?.length) return false;
  const ns="http://www.w3.org/2000/svg";
  const svg=doc.createElementNS(ns,"svg");
  svg.setAttribute("viewBox","0 0 600 300");
  svg.setAttribute("preserveAspectRatio","none");
  svg.style.width="100%";
  svg.style.height="100%";
  svg.style.display="block";
  svg.setAttribute("role","img");
  svg.setAttribute("aria-label","Chart");

  const left=58, top=18, right=138, bottom=48;
  const plotW=600-left-right, plotH=300-top-bottom;
  const values=chart.series.flatMap(s=>s.values||[]).filter(Number.isFinite);
  const maxRaw=Math.max(0,...values);
  const { max, ticks }=chartAxis(maxRaw || 1);
  for(let i=0;i<=ticks;i++){
    const value=max*(i/ticks);
    const y=top+plotH-(value/max)*plotH;
    line(svg,doc,ns,left,y,left+plotW,y,"#d8d8d8",1);
    text(svg,doc,ns,left-8,y+4,formatTick(value),"end",11,"#666");
  }
  line(svg,doc,ns,left,top,left,top+plotH,"#a9a9a9",1);
  line(svg,doc,ns,left,top+plotH,left+plotW,top+plotH,"#a9a9a9",1);

  const cats=chart.categories?.length ? chart.categories : chart.series[0]?.categories || [];
  const groups=Math.max(1,cats.length);
  const seriesCount=chart.series.length;
  const groupW=plotW/groups;
  const innerW=groupW*0.72;
  const barW=Math.max(2,innerW/seriesCount);
  for(let ci=0;ci<groups;ci++){
    const start=left+ci*groupW+(groupW-innerW)/2;
    for(let si=0;si<seriesCount;si++){
      const series=chart.series[si];
      const v=Number(series.values?.[ci] ?? 0);
      const h=Math.max(0,(v/max)*plotH);
      const r=doc.createElementNS(ns,"rect");
      r.setAttribute("x",String(start+si*barW));
      r.setAttribute("y",String(top+plotH-h));
      r.setAttribute("width",String(Math.max(1,barW-1)));
      r.setAttribute("height",String(h));
      r.setAttribute("fill",`#${series.color || fallbackChartColor(si)}`);
      svg.appendChild(r);
    }
    text(svg,doc,ns,left+ci*groupW+groupW/2,top+plotH+20,cats[ci] || "","middle",11,"#666");
  }

  let ly=54;
  for(let si=0;si<seriesCount;si++){
    const s=chart.series[si];
    const r=doc.createElementNS(ns,"rect");
    r.setAttribute("x","488"); r.setAttribute("y",String(ly-10)); r.setAttribute("width","12"); r.setAttribute("height","12");
    r.setAttribute("fill",`#${s.color || fallbackChartColor(si)}`); svg.appendChild(r);
    text(svg,doc,ns,507,ly,s.name || `Series ${si+1}`,"start",11,"#555");
    ly+=24;
  }

  container.appendChild(svg);
  return true;
}
function line(svg,doc,ns,x1,y1,x2,y2,stroke,width){ const el=doc.createElementNS(ns,"line"); el.setAttribute("x1",x1); el.setAttribute("y1",y1); el.setAttribute("x2",x2); el.setAttribute("y2",y2); el.setAttribute("stroke",stroke); el.setAttribute("stroke-width",width); svg.appendChild(el); }
function text(svg,doc,ns,x,y,value,anchor,size,fill){ const el=doc.createElementNS(ns,"text"); el.setAttribute("x",x); el.setAttribute("y",y); el.setAttribute("text-anchor",anchor); el.setAttribute("font-size",size); el.setAttribute("font-family","Arial, sans-serif"); el.setAttribute("fill",fill); el.textContent=String(value); svg.appendChild(el); }
function chartAxis(value){
  const targetTicks=6;
  const padded=value*1.1;
  const rawStep=padded/targetTicks;
  const p=10**Math.floor(Math.log10(rawStep));
  const n=rawStep/p;
  const step=(n<=1?1:n<=2?2:n<=2.5?2.5:n<=5?5:10)*p;
  const max=Math.max(step,Math.ceil(padded/step)*step);
  return {max,ticks:Math.round(max/step)};
}
function formatTick(v){ return Math.abs(v-Math.round(v))<1e-6?String(Math.round(v)):String(Math.round(v*10)/10); }
function fallbackChartColor(i){ return ["004586","FF420E","FFD320","579D1C","7E0021"][i%5]; }

function applyImageCrop(container,img,crop){
  const left=clampCrop(crop?.left), top=clampCrop(crop?.top), right=clampCrop(crop?.right), bottom=clampCrop(crop?.bottom);
  if(!(left||top||right||bottom)){
    img.style.width="100%"; img.style.height="100%"; img.style.objectFit="contain";
    return;
  }
  const visibleW=Math.max(0.001,1-left-right), visibleH=Math.max(0.001,1-top-bottom);
  container.style.overflow="hidden";
  img.style.position="absolute";
  img.style.width=`${100/visibleW}%`;
  img.style.height=`${100/visibleH}%`;
  img.style.left=`${-(left/visibleW)*100}%`;
  img.style.top=`${-(top/visibleH)*100}%`;
  img.style.objectFit="fill";
}

function clampCrop(value){
  const numeric=Number(value||0)/100000;
  return Math.min(0.999,Math.max(0,Number.isFinite(numeric)?numeric:0));
}
function paintFallback(container,node,doc){
  if (!node?.fallback || container.childNodes?.length) return;
  container.dataset.docxFallback = node.fallback.feature || "unsupported";
  container.style.backgroundColor ||= "#f5f5f5";
  container.style.border ||= "0.5pt dashed #999";
  const label=doc.createElement("span");
  label.textContent=`${node.fallback.feature || "Unsupported content"}`;
  label.style.fontSize="7pt";
  label.style.color="#666";
  label.style.display="block";
  label.style.padding="2pt";
  container.appendChild(label);
}

function paintTextbox(container,textBox,doc,renderOptions={}){
  if(!textBox?.blocks?.length) return;
  container.style.position ||= "absolute";
  for(const block of textBox.blocks){
    const rendered=block.type==="paragraph"?renderTextBlock(block,doc,{},renderOptions):block.type==="table"?renderTable(block,doc,renderOptions):null;
    if(!rendered) continue;
    rendered.style.left=`${block.x-textBox.x}pt`;
    rendered.style.top=`${block.y-textBox.y}pt`;
    container.appendChild(rendered);
  }
}

function dataUri(data,type){ const bytes=data instanceof Uint8Array?data:new Uint8Array(data); let binary=""; for(let i=0;i<bytes.length;i+=0x8000) binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000)); const base64=typeof btoa==="function"?btoa(binary):globalThis.Buffer?.from(bytes)?.toString("base64"); return `data:${type};base64,${base64||""}`; }

function applyVisual(el, visual) {
  if (!visual) return;
  if (visual.fill) el.style.backgroundColor = `#${String(visual.fill).replace(/^#/, "")}`;
  if (visual.line) {
    const widthPt = visual.line.widthPt ?? (visual.line.widthEmu != null ? Number(visual.line.widthEmu) / 12700 : 0.5);
    const dashStyle = mapDrawingDash(visual.line.dash);
    const stroke = `${Math.max(0.1, widthPt)}pt ${dashStyle} #${String(visual.line.color || "000000").replace(/^#/, "")}`;
    // A zero-height Word line is a single stroke, not a rectangular box.
    // Using `border` paints both the top and bottom edges and doubles its
    // visual weight. Keep ordinary shape outlines boxed, but render line
    // geometry with one bounded horizontal stroke.
    if (visual.geometry === "line") el.style.borderTop = stroke;
    else el.style.border = stroke;
  }
}

function mapDrawingDash(value) {
  const dash = String(value || "solid");
  if (["dot", "sysDot"].includes(dash)) return "dotted";
  if (["dash", "lgDash", "sysDash", "sysDashDot", "sysDashDotDot", "dashDot", "lgDashDot", "lgDashDotDot"].includes(dash)) return "dashed";
  return "solid";
}
