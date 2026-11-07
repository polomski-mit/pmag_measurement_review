// Break trajectories at excluded or unplottable observations.
function plotRuns(rows,project){
 const runs=[];let run=[];
 for(const row of rows){const v=project(row);if(row._screened_out||!v||!v.every(Number.isFinite)){if(run.length)runs.push(run);run=[]}else run.push(v)}
 if(run.length)runs.push(run);return runs;
}
// Local Ollama draft reviewed and corrected for specimen-coordinate geometry,
// finite-value handling, units, equal scales and hemisphere conventions.
function drawReviewPlots(canvas, rows, suspect, proposed, options={kelvinOffset:273.15}) {
  const dark=document.documentElement.dataset.theme==='dark';
  const palette={'#fff':'#1a2b33','#20333b':'#e0ebee','#40565e':'#c0d3da','#52676f':'#b7cbd2','#d5dfe1':'#49636e','#777':'#b1c2ca','#a6afb2':'#97adb7','#96a6ab':'#9db7c2','#8f9da3':'#b0c8d3','#b2bcc1':'#7f9eac','#bac0c3':'#7a929d','#b7bdc0':'#7a929d','#bd352f':'#ff8178','#c62828':'#ff8178','#ef8c00':'#ffb854','#b86b00':'#ffb854','#007d80':'#65ded7'};
  const ink=color=>dark?(palette[color]||color):color;
  const ctx=canvas.getContext('2d'), width=Math.max(320,canvas.clientWidth||900);
  const narrow=width<650, height=narrow?850:510, dpi=window.devicePixelRatio||1;
  canvas.style.height=height+'px';canvas.width=Math.round(width*dpi);canvas.height=Math.round(height*dpi);
  ctx.setTransform(dpi,0,0,dpi,0,0);ctx.fillStyle=ink('#fff');ctx.fillRect(0,0,width,height);
  ctx.font='12px system-ui';
  const finite=x=>x!==''&&x!=null&&Number.isFinite(Number(x));
  const temperature=r=>Number(r.treat_temp)-options.kelvinOffset;
  const chronological=rows.slice().sort((a,b)=>a.timestamp.localeCompare(b.timestamp));
  const index=chronological.findIndex(r=>r.timestamp===suspect.timestamp&&r.specimen===suspect.specimen);
  const local=chronological.slice(Math.max(0,index-3),index+4);
  const ghosts=rows.filter(r=>r._original).map(r=>({...r._original,_screened_out:true}));
  const localGhosts=local.filter(r=>r._original).map(r=>({...r._original,_screened_out:true}));
  const columns=narrow?1:2, pw=width/columns, ph=(height-28)/(narrow?4:2);
  const panels=Array.from({length:4},(_,i)=>({x:(i%columns)*pw+56,y:Math.floor(i/columns)*ph+35,w:pw-78,h:ph-82}));
  function text(value,x,y,color=ink('#40565e'),align='left'){ctx.fillStyle=color;ctx.textAlign=align;ctx.fillText(value,x,y)}
  function title(p,s){text(s,p.x,p.y-16,ink('#20333b'))}
  function point(x,y,color=ink('#777'),shape='circle',filled=true,size=4){
    if(!Number.isFinite(x)||!Number.isFinite(y))return;
    ctx.beginPath();if(shape==='square')ctx.rect(x-size,y-size,size*2,size*2);
    else if(shape==='diamond'){ctx.moveTo(x,y-size-1);ctx.lineTo(x+size+1,y);ctx.lineTo(x,y+size+1);ctx.lineTo(x-size-1,y);ctx.closePath()}
    else ctx.arc(x,y,size,0,2*Math.PI);
    ctx.fillStyle=filled?color:ink('#fff');ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.fill();ctx.stroke();
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
    for(const row of data){const v=project(row);if(v&&v.every(Number.isFinite))mark(row,()=>point(scales.sx(v[0]),scales.sy(v[1]),rowColor(row,color),row._screened_changed?'diamond':'circle',row.quality!=='b',3))}
  }
  function rowColor(row,fallback){return row._screened_out?ink('#bd352f'):row._screened_changed?ink('#007d80'):Number(row.dir_csd)>10?ink('#c62828'):Number(row.dir_csd)>4?ink('#ef8c00'):row.quality==='b'?ink('#b7bdc0'):fallback}
  function mark(row,draw){ctx.save();if(row._screened_out)ctx.globalAlpha=0.3;draw();ctx.restore()}
  function highlight(row,project,scales,color,shape){const v=project(row);if(v&&v.every(Number.isFinite))mark(row,()=>point(scales.sx(v[0]),scales.sy(v[1]),row._screened_out?ink('#bd352f'):row._screened_changed?ink('#007d80'):color,row._screened_changed?'diamond':shape,true,5))}

  const temps=rows.concat(ghosts).filter(r=>finite(r.treat_temp)).map(temperature);
  let tmin=Math.min(...temps),tmax=Math.max(...temps);if(!Number.isFinite(tmin)){tmin=0;tmax=1}if(tmin===tmax)tmax++;
  // Intensity is logarithmic; zeros cannot be plotted on a log scale.
  const p0=panels[0];title(p0,'Moment versus treatment temperature');
  const moments=rows.concat(ghosts).filter(r=>finite(r.magn_moment)&&Number(r.magn_moment)>0).map(r=>Math.log10(Number(r.magn_moment)));
  let mlo=Math.floor(Math.min(...moments)),mhi=Math.ceil(Math.max(...moments));if(!Number.isFinite(mlo)){mlo=-12;mhi=-8}if(mhi===mlo)mhi++;
  const ms=axes(p0,tmin,tmax,mlo,mhi,'Temperature (°C)','log₁₀ moment (A·m²)');
  const mp=r=>finite(r.magn_moment)&&Number(r.magn_moment)>0?[temperature(r),Math.log10(Number(r.magn_moment))]:null;
  series(chronological,mp,ms);series(ghosts,mp,ms,ink('#bd352f'),false);highlight(suspect,mp,ms,ink('#bd352f'),'square');
  if(proposed)highlight(proposed,mp,ms,ink('#007d80'),'diamond');
  if(Number(suspect.magn_moment)===0)text('Suspect moment = 0 (not on log axis)',p0.x,p0.y+13,ink('#bd352f'));
  // Schmidt equal-area projection: both hemispheres shown with different fill.
  const p1=panels[1];title(p1,'Equal-area directions · local context');
  const radius=Math.min(p1.w,p1.h)/2,cx=p1.x+p1.w/2,cy=p1.y+p1.h/2;
  ctx.beginPath();ctx.arc(cx,cy,radius,0,2*Math.PI);ctx.strokeStyle=ink('#96a6ab');ctx.stroke();
  text('+X',cx,cy-radius-3,ink('#52676f'),'center');text('+Y',cx+radius+3,cy+4);
  function stereo(row,color,shape,size=4){if(!finite(row.dir_dec)||!finite(row.dir_inc))return;const d=Number(row.dir_dec)*Math.PI/180,i=Number(row.dir_inc)*Math.PI/180,r=Math.sqrt(Math.max(0,1-Math.abs(Math.sin(i))));point(cx+radius*r*Math.sin(d),cy-radius*r*Math.cos(d),color,shape,i>=0,size)}
  local.concat(localGhosts).forEach(row=>mark(row,()=>stereo(row,rowColor(row,ink('#777')),row._screened_changed?'diamond':'circle',3)));mark(suspect,()=>stereo(suspect,rowColor(suspect,ink('#bd352f')),suspect._screened_changed?'diamond':'square',5));if(proposed)stereo(proposed,ink('#007d80'),'diamond',5);
  text('Filled = down I; open = up I (not loading)',p1.x,p1.y+p1.h+24);
  // Cartesian vectors: X=M cos I cos D, Y=M cos I sin D, Z=M sin I.
  const p2=panels[2];title(p2,'Zijderveld · local moments / local maximum');
  const scale=Math.max(...local.concat(localGhosts).map(r=>finite(r.magn_moment)?Number(r.magn_moment):0),proposed?Number(proposed.magn_moment)||0:0,1e-30);
  function xyz(row){if(![row.dir_dec,row.dir_inc,row.magn_moment].every(finite))return null;const d=Number(row.dir_dec)*Math.PI/180,i=Number(row.dir_inc)*Math.PI/180,m=Number(row.magn_moment)/scale;return [m*Math.cos(i)*Math.cos(d),m*Math.cos(i)*Math.sin(d),m*Math.sin(i)]}
  const size=Math.min(p2.w,p2.h);p2.x+=(p2.w-size)/2;p2.w=size;p2.h=size;
  const zs=axes(p2,-1.05,1.05,-1.05,1.05,'X / max moment','Y or −Z / max moment');
  ctx.save();ctx.setLineDash([3,3]);ctx.strokeStyle=ink('#d5dfe1');ctx.beginPath();ctx.moveTo(zs.sx(0),zs.sy(-1.05));ctx.lineTo(zs.sx(0),zs.sy(1.05));ctx.moveTo(zs.sx(-1.05),zs.sy(0));ctx.lineTo(zs.sx(1.05),zs.sy(0));ctx.stroke();ctx.restore();
  text('origin',zs.sx(0)+4,zs.sy(0)-5);
  const horizontal=r=>{const v=xyz(r);return v?[v[0],v[1]]:null},vertical=r=>{const v=xyz(r);return v?[v[0],-v[2]]:null};
  series(local,horizontal,zs,ink('#8f9da3'));series(local,vertical,zs,ink('#b2bcc1'));series(localGhosts,horizontal,zs,ink('#bd352f'),false);series(localGhosts,vertical,zs,ink('#bd352f'),false);
  for(const project of [horizontal,vertical]){highlight(suspect,project,zs,ink('#bd352f'),'square');if(proposed)highlight(proposed,project,zs,ink('#007d80'),'diamond')}
  // CSD retains all observations, including excluded or noisy readings.
  const p3=panels[3];title(p3,'Directional scatter · all specimen observations');
  const maxCsd=Math.max(12,...rows.filter(r=>finite(r.dir_csd)).map(r=>Number(r.dir_csd)));
  const cs=axes(p3,tmin,tmax,0,maxCsd*1.05,'Temperature (°C)','CSD (°)');
  const cp=r=>finite(r.dir_csd)?[temperature(r),Number(r.dir_csd)]:null;
  series(chronological,cp,cs);series(ghosts,cp,cs,ink('#bd352f'),false);for(const [threshold,color] of [[4,ink('#ef8c00')],[10,ink('#c62828')]]){ctx.beginPath();ctx.setLineDash([4,4]);ctx.moveTo(p3.x,cs.sy(threshold));ctx.lineTo(p3.x+p3.w,cs.sy(threshold));ctx.strokeStyle=color;ctx.stroke()}ctx.setLineDash([]);
  highlight(suspect,cp,cs,ink('#bd352f'),'square');text('10° high',p3.x+5,cs.sy(10)-5,ink('#c62828'));text('4° review',p3.x+p3.w-5,cs.sy(4)-5,ink('#b86b00'),'right');
  text('Gray: context · faded red: removed/original · teal: correction/preview · red square: current',12,height-9,ink('#40565e'));
}
