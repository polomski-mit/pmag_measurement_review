let ledger=structuredClone(initial.ledger),position=0,pendingChoice=null;
const $=id=>document.getElementById(id);
const storageKey=()=> 'measurement-review:'+(initial.bundle_id||initial.generated);
function entry(card){return card.section==='exclusions'?ledger.exclusions[card.id]:ledger.review_candidates.find(r=>r.review_id===card.id)}
function filtered(){const f=$('filter').value;return initial.deck.filter(c=>f==='all'||c.type===f||entry(c).status===f)}
function current(){return filtered()[position]}
function rowIdentity(row){return row._review_identity||row.specimen+'|'+row.timestamp}
function rowFor(identity){const specimen=identity.split('|')[0];return (initial.context[specimen]||[]).find(r=>rowIdentity(r)===identity)}
function persist(){try{localStorage.setItem(storageKey(),JSON.stringify({ledger,position}));$('cache-state').textContent='Autosaved in this browser · download a backup'}catch(e){$('cache-state').textContent='Cache unavailable · save a JSON copy'}}
function validateBundle(data){
 if(data.format!=='measurement-review-bundle'||data.version!==1||!data.bundle_id||!Array.isArray(data.deck)||!data.context||!data.ledger||data.ledger.version!==1)throw Error('Unsupported review bundle. Generate a version 1 bundle with the supplied Python tool.');
 if(!Array.isArray(data.ledger.review_candidates)||!data.ledger.exclusions)throw Error('Missing transformation ledger');
 const ids=new Set();
 for(const card of data.deck){
  if(!['exclusions','review_candidates'].includes(card.section)||!['exclusion','possible_flip','possible_swap'].includes(card.type)||typeof card.id!=='string'||!Array.isArray(card.datasets)||typeof card.specimen!=='string'||typeof card.identity!=='string')throw Error('Malformed review card');
  const token=card.section+':'+card.id;if(ids.has(token))throw Error('Duplicate review card');ids.add(token);
  const e=card.section==='exclusions'?(Object.hasOwn(data.ledger.exclusions,card.id)?data.ledger.exclusions[card.id]:null):data.ledger.review_candidates.find(r=>r.review_id===card.id);
  if(!e||!['pending','approved','rejected'].includes(e.status))throw Error('Invalid review status');
  if(card.type==='exclusion'&&(!Array.isArray(e.reasons)||e.action!=='exclude'))throw Error('Invalid exclusion proposal');
  if(card.type==='possible_flip'&&!['arrow-x','arrow-y'].includes(e.model))throw Error('Unsupported physical rotation model');
  const rows=data.context[card.specimen];if(!Array.isArray(rows)||!rows.some(r=>rowIdentity(r)===card.identity))throw Error('Missing source observation for review card');
 }
 return data;
}
function openBundle(value){
 validateBundle(value);initial=structuredClone(value);ledger=structuredClone(initial.ledger);position=0;$('filter').value='all';
 try{const cached=JSON.parse(localStorage.getItem(storageKey())||'null');if(cached){const proposed={...initial,ledger:cached.ledger};validateBundle(proposed);ledger=cached.ledger;position=cached.position||0}}catch(error){}
 $('cache-state').textContent='Bundle loaded locally · source data unchanged';render();
}
$('bundle').onchange=async event=>{try{const file=event.target.files[0];if(!file)return;if(file.size>50*1024*1024)throw Error('Bundle exceeds the 50 MB limit');openBundle(JSON.parse(await file.text()))}catch(error){alert(error.message)}finally{event.target.value=''}};
$('demo').hidden=!demoPayload;$('demo').onclick=()=>openBundle(demoPayload);
try{const cached=JSON.parse(localStorage.getItem(storageKey())||'null');if(cached){ledger=cached.ledger;position=cached.position||0}}catch(e){}
function proposed(row,e){if(!row)return null;if(e.type==='possible_flip'){const d=Number(row.dir_dec);return {...row,dir_dec:(((e.model==='arrow-x'?-d:180-d)%360)+360)%360,dir_inc:-Number(row.dir_inc)}}return null}
function explainFlag(e,type,row){
 const rules=ledger.rules||{}, lines=[];
 const degrees=value=>Number(value).toFixed(1)+'°';
 if(type==='exclusion')for(const reason of e.reasons){
  const evidence=e.evidence?.[reason]||{};
  if(reason==='low_moment'){
   const ratio=Number(evidence.ratio);
   lines.push(`Moment is ${(ratio*100).toPrecision(3)}% of the reference (${Number(evidence.reference_moment_Am2).toExponential(3)} A·m²), compared with a screening threshold of ${100*(rules.low_moment_ratio??0.01)}%. The baseline uses ${evidence.support==='bracketing_temperatures'?'log interpolation between nearby temperatures':'same-temperature observations'} of this specimen. Look for an isolated inward jump in both vector views and a dip in the moment plot; check subsequent recovery and lab notes.`);
  }else if(reason==='high_csd'||reason==='elevated_csd_review'){
   lines.push(`Recorded CSD is ${degrees(row.dir_csd)}. This exceeds the ${reason==='high_csd'?(rules.high_csd_degrees??10):(rules.review_csd_degrees??4)}° screening threshold. Inspect the CSD and moment plots together: a weak signal can have unstable directions, but this flag is based on scatter, not on vector length or a proven loading error.`);
  }else if(reason==='existing_bad_flag')lines.push('The input table already labels this observation bad. This proposal preserves that history for your review; it does not establish why the original flag was set. Consult the source notes.');
  else lines.push('Review the evidence and provenance for '+reason.replaceAll('_',' ')+'.');
 }
 if(type==='possible_flip')lines.push(`The ${e.model==='arrow-x'?'X':'Y'}-axis half-turn reduces angular mismatch from ${degrees(e.original_angle_degrees)} to ${degrees(e.transformed_angle_degrees)}. Compare red and teal directions with the surrounding observations. Vector length is unchanged: the proposed explanation is orientation, not lost moment. Confirm that this rotation matches your actual loading convention.`);
 if(type==='possible_swap')lines.push(`Exchanging this observation with ${e.partner_identity.split('|')[0]} reduces the two angular mismatches from ${e.original_angles_degrees.map(degrees).join(' / ')} to ${e.swapped_angles_degrees.map(degrees).join(' / ')}. Both must improve for this flag. Check both specimens, their moments, timestamps, and lab sequence; similar directions alone do not establish a swap.`);
 return lines;
}
function render(){const list=filtered();position=Math.max(0,Math.min(position,list.length-1));const card=list[position];$('empty').hidden=!!card;$('case').hidden=!card;$('counter').textContent=list.length?`${position+1} / ${list.length}`:'0 / 0';$('prev').disabled=position===0;$('next').disabled=position>=list.length-1;
 const counts={pending:0,approved:0,rejected:0};initial.deck.forEach(c=>counts[entry(c).status||'pending']++);$('totals').textContent=`${counts.pending} undecided · ${counts.approved} approved · ${counts.rejected} rejected`;
 $('save').disabled=!initial.deck.length;$('load').disabled=!initial.deck.length;if(!card)return;const e=entry(card),row=rowFor(card.identity),type=card.type;
 $('kind').textContent=type==='exclusion'?'Proposed exclusion':type==='possible_flip'?'Possible loading flip':'Possible specimen swap';
 $('title').textContent=`${card.specimen} · ${row?(Number(row.treat_temp)-(initial.temperature_offset_K??273.15)).toFixed(1)+'°C':'unavailable observation'} · ${card.identity.split('|')[1]}`;
 let description=type==='exclusion'?`Proposed action: exclude this observation from derived measurement tables if you approve. Raw files remain intact.`:type==='possible_flip'?`Approving applies the tested half-turn in specimen coordinates to derived data only. Moment is unchanged. Inspect context before choosing.`:`Proposed specimen exchange; verify both specimens before approving.`;
 const reasonLabels={existing_bad_flag:'Already marked bad in a source table',high_csd:'High directional scatter: CSD exceeds 10°',elevated_csd_review:'Directional scatter needs review: CSD exceeds 4°',low_moment:'Moment is at least 100× below reliable nearby-temperature measurements'};
 const reasons=type==='exclusion'?e.reasons.map(r=>reasonLabels[r]||r):type==='possible_flip'?[`Possible loading flip: ${e.model} half-turn`,`Angular mismatch: ${Number(e.original_angle_degrees).toFixed(1)}° → ${Number(e.transformed_angle_degrees).toFixed(1)}°`,`Context: ${e.support.replaceAll('_',' ')}`]:[`Possible swap with ${e.partner_identity}`,`Both angular mismatches improve: ${e.original_angles_degrees.map(v=>v.toFixed(1)+'°').join(' / ')} → ${e.swapped_angles_degrees.map(v=>v.toFixed(1)+'°').join(' / ')}`];
 const explanations=explainFlag(e,type,row);
 $('reasons').replaceChildren(...reasons.map((reason,index)=>{const li=document.createElement('li'),label=document.createElement('strong'),detail=document.createElement('p');label.textContent=reason;detail.textContent=explanations[index]||'';li.replaceChildren(label,detail);return li}));
 const csd=Number(row?.dir_csd);$('csd-warning').hidden=!(csd>4);$('csd-warning').textContent=csd>10?`High CSD: ${csd}° exceeds 10°`:`CSD warning: ${csd}° exceeds 4°`;
 $('csd-warning').style.cssText=csd>10?'background:#fde4e1;color:#a31e17;border-left:5px solid #c62828;padding:10px 14px;font-weight:650':'background:#fff0d9;color:#975300;border-left:5px solid #ef8c00;padding:10px 14px;font-weight:650';
 $('description').textContent=description;$('metadata').textContent=`Sources: ${card.datasets.join(', ')} · Moment: ${row?Number(row.magn_moment).toExponential(3):'?'} A·m² · CSD: ${row?row.dir_csd:'?'}° · Original quality: ${row?row.quality:'?'}`;
 $('note').value=e.review_note||'';$('evidence').textContent=JSON.stringify(e,null,2);$('decision').textContent=(e.status||'pending').toUpperCase();
 for(const [id,status] of [['yes','approved'],['no','rejected'],['undecided','pending']])$(id).setAttribute('aria-pressed',String((e.status||'pending')===status));
 if(row)drawReviewPlots($('plots'),initial.context[card.specimen],row,proposed(row,e),{kelvinOffset:initial.temperature_offset_K??273.15});
 $('partner-card').hidden=type!=='possible_swap';if(type==='possible_swap'){const partner=rowFor(e.partner_identity);if(partner){drawReviewPlots($('plots'),initial.context[card.specimen],row,partner,{kelvinOffset:initial.temperature_offset_K??273.15});drawReviewPlots($('partner-plots'),initial.context[partner.specimen],partner,row,{kelvinOffset:initial.temperature_offset_K??273.15})}}
}
function move(delta){position+=delta;render();persist()}
function choose(status){
 const card=current();if(!card||pendingChoice)return;
 pendingChoice={card,status,note:$('note').value,focus:document.activeElement};
 const label={approved:'APPROVE the proposed action',rejected:'REJECT the proposed action',pending:'leave this measurement UNDECIDED'}[status];
 $('confirm-measurement').textContent=$('title').textContent;
 $('confirm-message').textContent=`Hit Enter to confirm: ${label}, and go to the next measurement. Hit Esc to reassess this measurement. Your choice has not been saved yet.`;
 $('confirm-dialog').showModal();
}
function dismissChoice(){
 const previous=pendingChoice;pendingChoice=null;$('confirm-dialog').close();
 previous?.focus?.focus?.();
}
function confirmChoice(){
 if(!pendingChoice)return;
 const {card,status,note}=pendingChoice;const before=filtered();
 const next=before[before.findIndex(c=>c.id===card.id&&c.section===card.section)+1];
 const e=entry(card);e.status=status;e.review_note=note;dismissChoice();
 const after=filtered();
 if(next){const index=after.findIndex(c=>c.id===next.id&&c.section===next.section);if(index>=0)position=index;}
 render();persist();
 if(!next)$('cache-state').textContent+=' · End of review list';
}
$('confirm-choice').onclick=confirmChoice;$('cancel-choice').onclick=dismissChoice;
$('confirm-dialog').oncancel=e=>{e.preventDefault();dismissChoice()};
$('prev').onclick=()=>move(-1);$('next').onclick=()=>move(1);$('yes').onclick=()=>choose('approved');$('no').onclick=()=>choose('rejected');$('undecided').onclick=()=>choose('pending');
$('filter').onchange=()=>{position=0;render()};$('note').oninput=()=>{const card=current();if(card){entry(card).review_note=$('note').value;persist()}};
document.addEventListener('keydown',e=>{if(pendingChoice){if(e.key==='Enter'||e.key==='Escape'){e.preventDefault();if(!e.repeat){if(e.key==='Enter')confirmChoice();else dismissChoice()}}return}if(e.repeat)return;if(e.target.closest('input,textarea,select')||e.ctrlKey||e.metaKey||e.altKey)return;const k=e.key.toLowerCase();if(['arrowleft','arrowright','y','n','u'].includes(k)){e.preventDefault();if(k==='arrowleft')move(-1);if(k==='arrowright')move(1);if(k==='y')choose('approved');if(k==='n')choose('rejected');if(k==='u')choose('pending')}});
$('save').onclick=()=>{const blob=new Blob([JSON.stringify(ledger,null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='measurement_transformations.reviewed.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('cache-state').textContent='Decision file downloaded · source data unchanged'};
$('load').onchange=async e=>{try{const value=JSON.parse(await e.target.files[0].text());for(const card of initial.deck){const incoming=card.section==='exclusions'?value.exclusions[card.id]:value.review_candidates.find(r=>r.review_id===card.id);if(!incoming||!['pending','approved','rejected'].includes(incoming.status))throw Error('Review does not match this gallery');const old=entry(card);if(incoming.source_fingerprint!==old.source_fingerprint||incoming.partner_fingerprint!==old.partner_fingerprint)throw Error('Source observations changed');}for(const card of initial.deck){const incoming=card.section==='exclusions'?value.exclusions[card.id]:value.review_candidates.find(r=>r.review_id===card.id);Object.assign(entry(card),{status:incoming.status,review_note:incoming.review_note||''})}persist();render()}catch(error){alert(error.message)}};
window.addEventListener('resize',render);render();
