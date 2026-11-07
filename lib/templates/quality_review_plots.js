// Break trajectories at excluded or unplottable observations.
function plotRuns(rows,project){
 const runs=[];let run=[],previous=null;
 const removed=rows.filter(r=>r._screened_out).map(r=>Number(r.treat_temp)).filter(Number.isFinite);
 for(const row of rows){const v=project(row);if(row._screened_out||!v||!v.every(Number.isFinite)){if(run.length)runs.push(run);run=[]}else {if(previous&&removed.some(t=>t>=Math.min(Number(previous.treat_temp),Number(row.treat_temp))&&t<=Math.max(Number(previous.treat_temp),Number(row.treat_temp)))){if(run.length)runs.push(run);run=[]}run.push(v);previous=row}}
 if(run.length)runs.push(run);return runs;
}
// Local Ollama draft reviewed and corrected for specimen-coordinate geometry,
// finite-value handling, units, equal scales and hemisphere conventions.
function drawReviewPlots(canvas, rows, suspect, proposed, options={kelvinOffset:273.15}) {
  const repeatHits=[];
  canvas._repeatHitTargets=repeatHits;canvas.onclick=null;canvas.onmousemove=null;canvas.style.cursor='default';
  const dark=document.documentElement.dataset.theme==='dark';
  const palette={'#fff':'#1a2b33','#20333b':'#e0ebee','#40565e':'#c0d3da','#52676f':'#b7cbd2','#d5dfe1':'#49636e','#777':'#b1c2ca','#a6afb2':'#97adb7','#96a6ab':'#9db7c2','#8f9da3':'#b0c8d3','#b2bcc1':'#7f9eac','#bac0c3':'#7a929d','#b7bdc0':'#7a929d','#bd352f':'#ff8178','#c62828':'#ff8178','#ef8c00':'#ffb854','#b86b00':'#ffb854','#007d80':'#65ded7'};
  const ink=color=>dark?(palette[color]||color):color;
  const ctx=canvas.getContext('2d'), width=Math.max(320,canvas.clientWidth||900);
  const narrow=width<650, height=narrow?1800:980, dpi=window.devicePixelRatio||1;
  canvas.style.height=height+'px';canvas.width=Math.round(width*dpi);canvas.height=Math.round(height*dpi);
  ctx.setTransform(dpi,0,0,dpi,0,0);ctx.fillStyle=ink('#fff');ctx.fillRect(0,0,width,height);
  ctx.font='12px system-ui';
  const finite=x=>x!==''&&x!=null&&Number.isFinite(Number(x));
  const temperature=r=>Number(r.treat_temp)-options.kelvinOffset;
  const chronological=rows.slice().sort((a,b)=>Number(a.treat_temp)-Number(b.treat_temp)||a.timestamp.localeCompare(b.timestamp));
  const index=chronological.findIndex(r=>r.timestamp===suspect.timestamp&&r.specimen===suspect.specimen);
  const levels=[...new Set(chronological.map(r=>Number(r.treat_temp)))].sort((a,b)=>a-b);
  const center=levels.indexOf(Number(suspect.treat_temp));
  const nearby=new Set(levels.slice(Math.max(0,center-2),center+3));
  const local=options.full?chronological:chronological.filter(r=>nearby.has(Number(r.treat_temp)));
  const ghosts=rows.filter(r=>r._original).map(r=>({...r._original,_screened_out:true}));
  const localGhosts=local.filter(r=>r._original).map(r=>({...r._original,_screened_out:true}));
  const panels=narrow?[
    {x:60,y:40,w:width-88,h:210},{x:60,y:630,w:width-88,h:240},
    {x:60,y:1000,w:width-88,h:570},{x:60,y:335,w:width-88,h:210}
  ]:[
    {x:60,y:40,w:width/2-88,h:220},{x:60,y:390,w:width*.36-85,h:400},
    {x:width*.36+60,y:390,w:width*.64-90,h:440},{x:width/2+60,y:40,w:width/2-88,h:220}
  ];
  for(const panel of panels)panel.y+=narrow?60:40;
  function text(value,x,y,color=ink('#40565e'),align='left'){ctx.fillStyle=color;ctx.textAlign=align;ctx.fillText(value,x,y)}
  function title(p,s){text(s,p.x,p.y-16,ink('#20333b'))}
  function point(x,y,color=ink('#777'),shape='circle',filled=true,size=4){
    if(!Number.isFinite(x)||!Number.isFinite(y))return;
    ctx.beginPath();if(shape==='square')ctx.rect(x-size,y-size,size*2,size*2);
    else if(shape==='cross'){ctx.moveTo(x-size,y-size);ctx.lineTo(x+size,y+size);ctx.moveTo(x-size,y+size);ctx.lineTo(x+size,y-size)}
    else if(shape==='diamond'){ctx.moveTo(x,y-size-1);ctx.lineTo(x+size+1,y);ctx.lineTo(x,y+size+1);ctx.lineTo(x-size-1,y);ctx.closePath()}
    else ctx.arc(x,y,size,0,2*Math.PI);
    ctx.fillStyle=filled?color:ink('#fff');ctx.strokeStyle=color;ctx.lineWidth=1.5;if(shape!=='cross')ctx.fill();ctx.stroke();
  }
  const tick=v=>Math.abs(v)>999?Number(v).toExponential(0):Math.abs(v)<.01&&v!==0?Number(v).toExponential(0):Number(v.toFixed(1)).toString();
  function axes(p,xlo,xhi,ylo,yhi,xlabel,ylabel){
    if(xhi===xlo){xlo-=1;xhi+=1}if(yhi===ylo){ylo-=1;yhi+=1}
    const sx=x=>p.x+(x-xlo)/(xhi-xlo)*p.w,sy=y=>p.y+p.h-(y-ylo)/(yhi-ylo)*p.h;
    ctx.lineWidth=1;ctx.strokeStyle=ink('#d5dfe1');ctx.strokeRect(p.x,p.y,p.w,p.h);
    for(let j=0;j<=4;j++){const x=xlo+(xhi-xlo)*j/4,y=ylo+(yhi-ylo)*j/4;
      text(tick(x),sx(x),p.y+p.h+16,ink('#52676f'),'center');text(tick(y),p.x-7,sy(y)+4,ink('#52676f'),'right')}
    text(xlabel,p.x+p.w/2,p.y+p.h+34,ink('#40565e'),'center');
    ctx.save();ctx.translate(p.x-40,p.y+p.h/2);ctx.rotate(-Math.PI/2);text(ylabel,0,0,ink('#40565e'),'center');ctx.restore();
    return {sx,sy};
  }
  function series(data,project,scales,color=ink('#a6afb2'),connect=true){
    ctx.beginPath();for(const run of plotRuns(data,project))run.forEach((v,i)=>{const x=scales.sx(v[0]),y=scales.sy(v[1]);if(connect){if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)}});
    ctx.strokeStyle=color;ctx.lineWidth=1;ctx.stroke();
    for(const row of data){const v=project(row);if(v&&v.every(Number.isFinite))mark(row,()=>point(scales.sx(v[0]),scales.sy(v[1]),rowColor(row,color),row._screened_out?'cross':row._screened_changed?'diamond':'circle',row.quality!=='b',3))}
  }
  function rowColor(row,fallback){return row._screened_out?ink('#bd352f'):row._screened_changed?ink('#007d80'):Number(row.dir_csd)>10?ink('#c62828'):Number(row.dir_csd)>4?ink('#ef8c00'):row.quality==='b'?ink('#b7bdc0'):fallback}
  function mark(row,draw){ctx.save();if(row._screened_out)ctx.globalAlpha=0.3;draw();ctx.restore()}
  function highlight(row,project,scales,color,shape){const v=project(row);if(v&&v.every(Number.isFinite))mark(row,()=>point(scales.sx(v[0]),scales.sy(v[1]),row._screened_out?ink('#bd352f'):row._screened_changed?ink('#007d80'):color,row._screened_out?'cross':row._screened_changed?'diamond':shape,true,5))}

  const temps=local.concat(localGhosts).filter(r=>finite(r.treat_temp)).map(temperature);
  let tmin=Math.min(...temps),tmax=Math.max(...temps);if(!Number.isFinite(tmin)){tmin=0;tmax=1}if(tmin===tmax)tmax++;
  // Intensity is logarithmic; zeros cannot be plotted on a log scale.
  const p0=panels[0];title(p0,'Moment versus treatment temperature');
  const moments=local.concat(localGhosts).filter(r=>finite(r.magn_moment)&&Number(r.magn_moment)>0).map(r=>Math.log10(Number(r.magn_moment)));
  let mlo=Math.floor(Math.min(...moments)),mhi=Math.ceil(Math.max(...moments));if(!Number.isFinite(mlo)){mlo=-12;mhi=-8}if(mhi===mlo)mhi++;
  const ms=axes(p0,tmin,tmax,mlo,mhi,'Temperature (°C)','log₁₀ moment (A·m²)');
  const mp=r=>finite(r.magn_moment)&&Number(r.magn_moment)>0?[temperature(r),Math.log10(Number(r.magn_moment))]:null;
  series(local,mp,ms);series(localGhosts,mp,ms,ink('#bd352f'),false);highlight(suspect,mp,ms,ink('#bd352f'),'square');
  if(proposed)highlight(proposed,mp,ms,ink('#007d80'),'diamond');
  if(Number(suspect.magn_moment)===0)text('Suspect moment = 0 (not on log axis)',p0.x,p0.y+13,ink('#bd352f'));
  // Schmidt equal-area projection: both hemispheres shown with different fill.
  const p1=panels[1];title(p1,'Equal-area · specimen directions');
  const radius=Math.min(p1.w,p1.h)/2,cx=p1.x+p1.w/2,cy=p1.y+p1.h/2;
  ctx.beginPath();ctx.arc(cx,cy,radius,0,2*Math.PI);ctx.strokeStyle=ink('#96a6ab');ctx.stroke();
  text('+X',cx,cy-radius-3,ink('#52676f'),'center');text('+Y',cx+radius+3,cy+4);
  function stereo(row,color,shape,size=4){if(!finite(row.dir_dec)||!finite(row.dir_inc))return;const d=Number(row.dir_dec)*Math.PI/180,i=Number(row.dir_inc)*Math.PI/180,r=Math.sqrt(Math.max(0,1-Math.abs(Math.sin(i))));point(cx+radius*r*Math.sin(d),cy-radius*r*Math.cos(d),color,shape,i>=0,size)}
  local.concat(localGhosts).forEach(row=>mark(row,()=>stereo(row,rowColor(row,ink('#777')),row._screened_out?'cross':row._screened_changed?'diamond':'circle',3)));mark(suspect,()=>stereo(suspect,rowColor(suspect,ink('#bd352f')),suspect._screened_changed?'diamond':'square',5));if(proposed)stereo(proposed,ink('#007d80'),'diamond',5);
  text('Filled = down I; open = up I (not loading)',p1.x,p1.y+p1.h+24);
  // Cartesian vectors: X=M cos I cos D, Y=M cos I sin D, Z=M sin I.
  const p2=panels[2];title(p2,'Zijderveld · specimen coordinates');
  const scale=Math.max(...local.concat(localGhosts).map(r=>finite(r.magn_moment)?Number(r.magn_moment):0),proposed?Number(proposed.magn_moment)||0:0,1e-30);
  function xyz(row){if(![row.dir_dec,row.dir_inc,row.magn_moment].every(finite))return null;const d=Number(row.dir_dec)*Math.PI/180,i=Number(row.dir_inc)*Math.PI/180,m=Number(row.magn_moment)/scale;return [m*Math.cos(i)*Math.cos(d),m*Math.cos(i)*Math.sin(d),m*Math.sin(i)]}
  const size=Math.min(p2.w,p2.h);p2.x+=(p2.w-size)/2;p2.w=size;p2.h=size;
  const alongY=options.axis==='y',horizontalAxis=alongY?'Y':'X',otherAxis=alongY?'X':'Y';
  const zs=axes(p2,-1.05,1.05,-1.05,1.05,horizontalAxis+' / maximum moment',otherAxis+' or −Z / maximum moment');
  ctx.save();ctx.setLineDash([3,3]);ctx.strokeStyle=ink('#d5dfe1');ctx.beginPath();ctx.moveTo(zs.sx(0),zs.sy(-1.05));ctx.lineTo(zs.sx(0),zs.sy(1.05));ctx.moveTo(zs.sx(-1.05),zs.sy(0));ctx.lineTo(zs.sx(1.05),zs.sy(0));ctx.stroke();ctx.restore();
  text('origin',zs.sx(0)+4,zs.sy(0)-5);
  const horizontal=r=>{const v=xyz(r);return v?[v[alongY?1:0],v[alongY?0:1]]:null},vertical=r=>{const v=xyz(r);return v?[v[alongY?1:0],-v[2]]:null};
  const colorFor=row=>{const f=(temperature(row)-tmin)/(tmax-tmin);return `hsl(${220-195*Math.max(0,Math.min(1,f))},${dark?80:72}%,${dark?68:42}%)`};
  function vectorSeries(data,project,verticalProjection){
   ctx.beginPath();for(const run of plotRuns(data,project))run.forEach((v,i)=>{if(i===0)ctx.moveTo(zs.sx(v[0]),zs.sy(v[1]));else ctx.lineTo(zs.sx(v[0]),zs.sy(v[1]))});
   ctx.strokeStyle=ink(verticalProjection?'#b2bcc1':'#8f9da3');ctx.lineWidth=1;ctx.stroke();
   for(const row of data){const v=project(row);if(!v||!v.every(Number.isFinite))continue;
    const current=rowIdentityForPlot(row)===rowIdentityForPlot(suspect);
    mark(row,()=>point(zs.sx(v[0]),zs.sy(v[1]),row._screened_out?ink('#bd352f'):row._screened_changed?ink('#007d80'):colorFor(row),row._screened_out?'cross':verticalProjection?'square':'circle',!verticalProjection,current?6:4));
   }
  }
  function rowIdentityForPlot(row){return row._review_identity||row.specimen+'|'+row.timestamp}
  vectorSeries(local,horizontal,false);vectorSeries(local,vertical,true);
  for(const ghost of localGhosts)for(const project of [horizontal,vertical])highlight(ghost,project,zs,ink('#bd352f'),'cross');
  if(proposed)for(const project of [horizontal,vertical])highlight(proposed,project,zs,ink('#007d80'),'diamond');
  text('● horizontal   □ vertical · cooler → hotter',p2.x,p2.y+p2.h+54);
  for(let i=0;i<20;i++){ctx.fillStyle=colorFor({treat_temp:tmin+options.kelvinOffset+(tmax-tmin)*i/19});ctx.fillRect(p2.x+i*p2.w/20,p2.y+p2.h+64,p2.w/20+1,8)}
  text(`${tmin.toFixed(0)}°C`,p2.x,p2.y+p2.h+88);text(`${tmax.toFixed(0)}°C`,p2.x+p2.w,p2.y+p2.h+88,ink('#40565e'),'right');
  // CSD retains all observations, including excluded or noisy readings.
  const p3=panels[3];title(p3,options.full?'Directional scatter · all specimen observations':'Directional scatter · nearby steps');
  const maxCsd=Math.max(12,...local.filter(r=>finite(r.dir_csd)).map(r=>Number(r.dir_csd)));
  const cs=axes(p3,tmin,tmax,0,maxCsd*1.05,'Temperature (°C)','CSD (°)');
  const cp=r=>finite(r.dir_csd)?[temperature(r),Number(r.dir_csd)]:null;
  series(local,cp,cs);series(localGhosts,cp,cs,ink('#bd352f'),false);for(const [threshold,color] of [[4,ink('#ef8c00')],[10,ink('#c62828')]]){ctx.beginPath();ctx.setLineDash([4,4]);ctx.moveTo(p3.x,cs.sy(threshold));ctx.lineTo(p3.x+p3.w,cs.sy(threshold));ctx.strokeStyle=color;ctx.stroke()}ctx.setLineDash([]);
  highlight(suspect,cp,cs,ink('#bd352f'),'square');text('10° high',p3.x+5,cs.sy(10)-5,ink('#c62828'));text('4° review',p3.x+p3.w-5,cs.sy(4)-5,ink('#b86b00'),'right');
  // Explicit repeat comparison: preserve true coordinates and separate clickable
  // numbered callouts so even coincident readings remain individually selectable.
  const candidates=options.repeatCandidates||[];
  if(candidates.length){
   const colors=options.candidateColors||candidates.map((_,i)=>`hsl(${(i*137.508)%360},75%,${dark?70:38}%)`);
   const labels=[];
   function candidateMark(row,i,x,y,panel,projection=''){
    if(!Number.isFinite(x)||!Number.isFinite(y))return;
    const identity=rowIdentityForPlot(row),selected=identity===options.selectedIdentity,color=colors[i];
    point(x,y,color,projection==='vertical'?'square':'circle',projection!=='vertical',selected?7:5);
    if(selected){ctx.beginPath();ctx.arc(x,y,10,0,2*Math.PI);ctx.strokeStyle=ink('#20333b');ctx.lineWidth=2;ctx.stroke()}
    let lx=Math.max(panel.x+3,Math.min(x+12,panel.x+panel.w-40));
    let ly=Math.max(panel.y+3,Math.min(y-24-i*20,panel.y+panel.h-20));
    for(let tries=0;tries<candidates.length*4+8&&labels.some(r=>Math.abs(r.x-lx)<40&&Math.abs(r.y-ly)<20);tries++){
     ly+=21;if(ly>panel.y+panel.h-20){ly=panel.y+3;lx=Math.min(panel.x+panel.w-40,lx+42)}
    }
    labels.push({x:lx,y:ly});
    ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(lx+16,ly+9);ctx.strokeStyle=color;ctx.lineWidth=1;ctx.stroke();
    ctx.fillStyle=ink('#fff');ctx.fillRect(lx,ly,36,18);ctx.strokeStyle=color;ctx.lineWidth=selected?3:1;ctx.strokeRect(lx,ly,36,18);
    text(String(i+1)+(projection==='vertical'?' V':projection==='horizontal'?' H':''),lx+18,ly+13,color,'center');
    repeatHits.push({identity,x:lx,y:ly,w:36,h:18,kind:'label'},{identity,x:x-9,y:y-9,w:18,h:18,kind:'point'});
   }
   candidates.forEach((row,i)=>{
    for(const [project,scales,panel,name] of [[mp,ms,p0,''],[cp,cs,p3,''],[horizontal,zs,p2,'horizontal'],[vertical,zs,p2,'vertical']]){
     const v=project(row);if(v&&v.every(Number.isFinite))candidateMark(row,i,scales.sx(v[0]),scales.sy(v[1]),panel,name);
    }
    if(finite(row.dir_dec)&&finite(row.dir_inc)){
     const d=Number(row.dir_dec)*Math.PI/180,inc=Number(row.dir_inc)*Math.PI/180,r=Math.sqrt(Math.max(0,1-Math.abs(Math.sin(inc))));
     candidateMark(row,i,cx+radius*r*Math.sin(d),cy-radius*r*Math.cos(d),p1);
    }
   });
   function hitsAt(event){const rect=canvas.getBoundingClientRect();const x=(event.clientX-rect.left)*width/rect.width,y=(event.clientY-rect.top)*height/rect.height;
    const hits=repeatHits.filter(hit=>x>=hit.x&&x<=hit.x+hit.w&&y>=hit.y&&y<=hit.y+hit.h);
    const label=hits.find(hit=>hit.kind==='label');return label?[label.identity]:[...new Set(hits.map(hit=>hit.identity))];
   }
   canvas.onclick=event=>{const hits=hitsAt(event);if(hits.length===1)options.onCandidateClick?.(hits[0]);else if(hits.length>1)options.onCandidateOverlap?.(hits)};
   canvas.onmousemove=event=>{const hits=hitsAt(event);canvas.style.cursor=hits.length?'pointer':'default';canvas.title=hits.length>1?'Overlapping measurements: click a numbered callout or candidate button.':hits.length?'Select repeat '+(candidates.findIndex(r=>rowIdentityForPlot(r)===hits[0])+1):''};
  }
  // Selection is a UI focus marker, separate from quality/severity colors.
  // Draw last and at full opacity, including when this observation is excluded.
  const selectionColor=dark?'#ff70e8':'#b0008f',selectedTemp=temperature(suspect);
  const selectionLabel=`${Number.isFinite(selectedTemp)?selectedTemp.toFixed(1)+'°C':'temperature unavailable'}`;
  const selectedState=suspect._screened_out?' · EXCLUDED':suspect._screened_changed?' · CORRECTED':'';
  ctx.font='bold 13px system-ui';
  text(`SELECTED: ${suspect.specimen} · ${selectionLabel}${selectedState}${narrow?'':' · '+suspect.timestamp}`,12,18,selectionColor);
  ctx.font='12px system-ui';
  if(narrow){text(suspect.timestamp,12,36,ink('#40565e'));text('Pink halo = selected · H horizontal / V vertical',12,54,ink('#40565e'))}
  else text('Pink halo + leader = selected measurement; H = horizontal, V = vertical projection',12,36,ink('#40565e'));
  function selectionMarker(project,scales,panel,projection='',slot=0){
   const value=project(suspect),label=`SELECTED${projection?' '+projection:''} · ${selectionLabel}`;
   const lx=panel.x+7,ly=panel.y+8+slot*27,lw=Math.min(panel.w-14,215);
   ctx.save();ctx.globalAlpha=1;ctx.setLineDash([]);
   if(value&&value.every(Number.isFinite)){
    const x=scales.sx(value[0]),y=scales.sy(value[1]);
    // Dark outer rim and light inner rim remain visible over any trajectory.
    for(const [radius,color,lineWidth] of [[11,'#101c22',5],[10,'#ffffff',3],[8,selectionColor,3]]){
     ctx.beginPath();ctx.arc(x,y,radius,0,2*Math.PI);ctx.strokeStyle=color;ctx.lineWidth=lineWidth;ctx.stroke();
    }
    point(x,y,selectionColor,projection==='V'?'square':'circle',projection!=='V',5);
    ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(lx+lw/2,ly+11);ctx.strokeStyle=selectionColor;ctx.lineWidth=1.5;ctx.stroke();
   }
   ctx.fillStyle=ink('#fff');ctx.fillRect(lx,ly,lw,22);ctx.strokeStyle=selectionColor;ctx.lineWidth=2;ctx.strokeRect(lx,ly,lw,22);
   ctx.font='bold 11px system-ui';text(value&&value.every(Number.isFinite)?label:'SELECTED · value unavailable',lx+6,ly+15,selectionColor);ctx.restore();
  }
  selectionMarker(mp,ms,p0);selectionMarker(cp,cs,p3);
  const stereoProject=row=>{if(!finite(row.dir_dec)||!finite(row.dir_inc))return null;const d=Number(row.dir_dec)*Math.PI/180,i=Number(row.dir_inc)*Math.PI/180,r=Math.sqrt(Math.max(0,1-Math.abs(Math.sin(i))));return [cx+radius*r*Math.sin(d),cy-radius*r*Math.cos(d)]};
  selectionMarker(stereoProject,{sx:x=>x,sy:y=>y},p1);
  selectionMarker(horizontal,zs,p2,'H');selectionMarker(vertical,zs,p2,'V',1);
  text(`Faded red ×: excluded/original · teal: correction/preview · current: ${options.status||'pending'}`,12,height-9,ink('#40565e'));
}
