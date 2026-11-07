let manualPreview=null;
let ledger=structuredClone(initial.ledger),position=0,pendingChoice=null;
const $=id=>document.getElementById(id);
let darkMode=false,repeatInspect=false,reviewStage='quality',repeatContext=null,stageBusy=false;
try{const savedTheme=localStorage.getItem('measurement-review-theme');darkMode=savedTheme?savedTheme==='dark':!!window.matchMedia?.('(prefers-color-scheme: dark)').matches}catch(error){}
function applyTheme(){document.documentElement.dataset.theme=darkMode?'dark':'light';$('theme').textContent=darkMode?'Light mode':'Dark mode';$('theme').setAttribute('aria-pressed',String(darkMode))}
applyTheme();
$('theme').onclick=()=>{darkMode=!darkMode;applyTheme();try{localStorage.setItem('measurement-review-theme',darkMode?'dark':'light')}catch(error){}render()};
const storageKey=()=> 'measurement-review:'+(initial.bundle_id||initial.generated);
function entry(card){return card.section==='exclusions'?ledger.exclusions[card.id]:ledger.review_candidates.find(r=>r.review_id===card.id)}
function filtered(){const f=$('filter').value;return initial.deck.filter(c=>f==='all'||c.type===f||entry(c).status===f)}
function current(){return filtered()[position]}
function resumeToUndecided(){
 $('filter').value='all';const list=filtered(),start=Math.max(0,Math.min(Number(position)||0,list.length-1));
 for(let offset=0;offset<list.length;offset++){const index=(start+offset)%list.length;if((entry(list[index]).status||'pending')==='pending'){position=index;return}}
 position=Math.max(0,list.length-1);
}

function rowIdentity(row){return row._review_identity||row.specimen+'|'+row.timestamp}
function rowFor(identity){const specimen=identity.split('|')[0];return (initial.context[specimen]||[]).find(r=>rowIdentity(r)===identity)}
function persist(){ledger.repeat_selections=validatedRepeatSelections(ledger.repeat_selections||{});try{localStorage.setItem(storageKey(),JSON.stringify({ledger,position}));$('cache-state').textContent='Autosaved in this browser · download a backup'}catch(e){$('cache-state').textContent='Cache unavailable · save a JSON copy'}}
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
 $('stage-dialog').close();if(pendingChoice)dismissChoice();
 validateBundle(value);initial=structuredClone(value);ledger=structuredClone(initial.ledger);reviewStage='quality';repeatContext=null;repeatInspect=false;position=0;$('filter').value='all';
 try{const cached=JSON.parse(localStorage.getItem(storageKey())||'null');if(cached){const proposed={...initial,ledger:cached.ledger};validateBundle(proposed);ledger=cached.ledger;position=cached.position||0}}catch(error){}
 $('cache-state').textContent='Bundle loaded locally · source data unchanged';manualPreview=null;resumeToUndecided();render();
}
$('bundle').onchange=async event=>{try{const file=event.target.files[0];if(!file)return;if(file.size>50*1024*1024)throw Error('Bundle exceeds the 50 MB limit');openBundle(JSON.parse(await file.text()))}catch(error){alert(error.message)}finally{event.target.value=''}};
$('demo').hidden=!demoPayload;$('demo').onclick=()=>openBundle(demoPayload);
try{const cached=JSON.parse(localStorage.getItem(storageKey())||'null');if(cached){ledger=cached.ledger;position=cached.position||0}}catch(e){}
resumeToUndecided();
function proposed(row,e){if(!row)return null;if(e.type==='possible_flip'){const d=Number(row.dir_dec);return {...row,dir_dec:(((e.model==='arrow-x'?-d:180-d)%360)+360)%360,dir_inc:-Number(row.dir_inc)}}return null}
// Review priorities are transparent display heuristics, never automatic decisions.
function screenedRows(specimen,options={}){
 const rows=(initial.context[specimen]||[]).map(r=>({...r}));
 if($('plot-view').value==='raw')return rows;
 const actions=new Map();
 function add(id,action){if(!actions.has(id))actions.set(id,[]);actions.get(id).push(action)}
 for(const [id,e] of Object.entries(ledger.exclusions))if(e.status==='approved')add(id,{type:'exclude'});
 for(const e of ledger.review_candidates)if(e.status==='approved'){
  add(e.identity,e);if(e.type==='possible_swap')add(e.partner_identity,e);
 }
 const conflicts=new Set([...actions].filter(([,list])=>list.length>1).map(([id])=>id));
 // A conflicting swap is withheld for both partners, never half applied.
 for(const list of actions.values())for(const e of list)if(e.type==='possible_swap'&&(conflicts.has(e.identity)||conflicts.has(e.partner_identity))){conflicts.add(e.identity);conflicts.add(e.partner_identity)}
 $('plot-state').textContent=conflicts.size?'Conflicting approved actions: affected observations shown unchanged. Resolve decisions before exporting.':'Screened view: confirmed actions only. Faded red = excluded/outgoing; teal = corrected; pending stays unchanged (and connected).';
 function plotRepeatValid(group,choice){const ids=group.identities.filter(id=>ledger.exclusions[id]?.status!=='approved');return choice.all_bad===true?choice.selected_identity===null&&JSON.stringify([...(choice.identities||[])].sort())===JSON.stringify(ids.sort()):ids.includes(choice.selected_identity)}
 for(const group of Object.values(options.ignoreRepeatSelections||(typeof reviewStage!=='undefined'&&reviewStage==='quality')?{}:initial.repeat_groups||{}))if(group.specimen===specimen&&ledger.repeat_selections?.[group.group_id]?.signature===group.signature&&plotRepeatValid(group,ledger.repeat_selections[group.group_id])){const selected=ledger.repeat_selections[group.group_id].selected_identity;for(const row of rows)if(group.identities.includes(rowIdentity(row))&&rowIdentity(row)!==selected)row._screened_out=true}
 const incoming=[];
 for(const row of rows){const id=rowIdentity(row),list=actions.get(id);if(!list||conflicts.has(id))continue;
  const action=list[0];
  if(action.type==='exclude')row._screened_out=true;
  if(action.type==='possible_flip'){row._original={...row};Object.assign(row,proposed(row,action));row._screened_changed=true;}
  if(action.type==='possible_swap'){
   const other=rowFor(id===action.identity?action.partner_identity:action.identity);
   if(other){row._screened_out=true;incoming.push({...other,specimen,_screened_changed:true});}
  }
 }
 return rows.concat(incoming);
}
$('plot-view').value='screened';$('plot-view').onchange=render;
$('vector-view').value='x';$('vector-context').value='all';$('vector-view').onchange=render;$('vector-context').onchange=render;
function reviewWarnings(e,type,row){
 const warnings=[];
 if(type==='exclusion')for(const reason of e.reasons){
  if(reason==='high_csd'||reason==='elevated_csd_review'){
   const high=Number(row.dir_csd)>10;
   warnings.push({reason,level:high?'red':'orange',rank:high?3:1,label:high?'High scatter':'Scatter caution',detail:`CSD ${Number(row.dir_csd)}°: ${high?'above 10°':'above 4° through 10°'}. Inspect signal strength and repeatability.`});
  }else if(reason==='low_moment'){
   const ratio=Number(e.evidence?.low_moment?.ratio),veryLow=Number.isFinite(ratio)&&ratio<=0.001;
   warnings.push({reason,level:'magenta',rank:veryLow?3:1,label:veryLow?'Very low moment':'Low moment caution',detail:`${Number.isFinite(ratio)?(100*ratio).toPrecision(3)+'% of the reference moment. ':''}${ratio>0?'Drop of '+(-Math.log10(ratio)).toFixed(2)+' log₁₀ units. ':''}${veryLow?'At least 1,000× weaker':'Inspect the intensity dip'}; check for sample loss, positioning problems, or genuine demagnetization.`});
  }else warnings.push({reason,level:'blue',rank:0,label:'Source history',detail:'Previously flagged in the input. Consult the original quality decision and notes.'});
 }
 if(type==='possible_flip'||type==='possible_swap')warnings.push({reason:type,level:'purple',rank:2,label:'Orientation / identity review',detail:type==='possible_flip'?(e.origin==='manual'?'User-requested rotation; no automatic improvement is claimed. Verify the physical axes before applying.':'A loading rotation improves directional agreement. Verify the physical axes before applying.'):'Exchanging observations improves both specimens. Check both histories before applying.'});
 return warnings;
}
function explainFlag(e,type,row){
 const rules=ledger.rules||{}, lines=[];
 const degrees=value=>Number(value).toFixed(1)+'°';
 if(type==='exclusion')for(const reason of e.reasons){
  const evidence=e.evidence?.[reason]||{};
  if(reason==='low_moment'){
   const ratio=Number(evidence.ratio);
   lines.push(`Moment is ${(ratio*100).toPrecision(3)}% of the reference (${Number(evidence.reference_moment_Am2).toExponential(3)} A·m²), compared with a screening threshold of ${100*(rules.low_moment_ratio??0.01)}%. ${ratio>0?'That is a drop of '+(-Math.log10(ratio)).toFixed(2)+' log₁₀ units (reference log₁₀ moment '+Math.log10(Number(evidence.reference_moment_Am2)).toFixed(2)+' → recorded '+Math.log10(Number(evidence.moment_Am2)).toFixed(2)+').':'A zero moment cannot appear on a logarithmic axis.'} The baseline uses ${evidence.support==='bracketing_temperatures'?'log interpolation between nearby temperatures':'same-temperature observations'} of this specimen. Look for an isolated inward jump in both vector views and a dip in the moment plot; check subsequent recovery and lab notes.`);
  }else if(reason==='high_csd'||reason==='elevated_csd_review'){
   lines.push(`Recorded CSD is ${degrees(row.dir_csd)}. This exceeds the ${reason==='high_csd'?(rules.high_csd_degrees??10):(rules.review_csd_degrees??4)}° screening threshold. Inspect the CSD and moment plots together: a weak signal can have unstable directions, but this flag is based on scatter, not on vector length or a proven loading error.`);
  }else if(reason==='existing_bad_flag')lines.push('The input table already labels this observation bad. This proposal preserves that history for your review; it does not establish why the original flag was set. Consult the source notes.');
  else lines.push('Review the evidence and provenance for '+reason.replaceAll('_',' ')+'.');
 }
 if(type==='possible_flip'&&e.origin==='manual')lines.push('User-requested loading half-turn. It was not selected by an automatic improvement threshold. Verify the original and preview vectors and the physical loading axis; moment is preserved.');
 if(type==='possible_flip'&&e.origin!=='manual')lines.push(`The ${e.model==='arrow-x'?'X':'Y'}-axis half-turn reduces angular mismatch from ${degrees(e.original_angle_degrees)} to ${degrees(e.transformed_angle_degrees)}. Compare red and teal directions with the surrounding observations. Vector length is unchanged: the proposed explanation is orientation, not lost moment. Confirm that this rotation matches your actual loading convention.`);
 if(type==='possible_swap')lines.push(`Exchanging this observation with ${e.partner_identity.split('|')[0]} reduces the two angular mismatches from ${e.original_angles_degrees.map(degrees).join(' / ')} to ${e.swapped_angles_degrees.map(degrees).join(' / ')}. Both must improve for this flag. Check both specimens, their moments, timestamps, and lab sequence; similar directions alone do not establish a swap.`);
 return lines;
}
function render(){paintStage();renderRepeats();$('repeat-options').hidden=!repeatInspect;if(reviewStage==='repeats'){repeatInspect=repeatGroups().length>0;if(repeatInspect)inspectRepeat();else{$('case').hidden=true;$('empty').hidden=false;$('empty').textContent='No repeated temperatures remain after applying your bad-measurement decisions.'}return}const list=filtered();position=Math.max(0,Math.min(position,list.length-1));const card=list[position];$('empty').hidden=!!card;$('case').hidden=!card;$('counter').textContent=list.length?`${position+1} / ${list.length}`:'0 / 0';$('prev').disabled=position===0;$('next').disabled=position>=list.length-1;
 const counts={pending:0,approved:0,rejected:0};initial.deck.forEach(c=>counts[entry(c).status||'pending']++);$('totals').textContent=`${counts.pending} undecided · ${counts.approved} approved · ${counts.rejected} rejected`;
 for(const id of ['yes','no','undecided','note'])$(id).disabled=false;
 $('save').disabled=!initial.deck.length&&!repeatGroups().length;$('load').disabled=!initial.deck.length;if(!card)return;const e=entry(card),row=rowFor(card.identity),type=card.type;
 $('kind').textContent=type==='exclusion'?'Proposed exclusion':type==='possible_flip'?'Possible loading flip':'Possible specimen swap';
 $('title').textContent=`${card.specimen} · ${row?(Number(row.treat_temp)-(initial.temperature_offset_K??273.15)).toFixed(1)+'°C':'unavailable observation'} · ${card.identity.split('|')[1]}`;
 let description=type==='exclusion'?`Proposed action: exclude this observation from derived measurement tables if you approve. Raw files remain intact.`:type==='possible_flip'?`Approving applies the tested half-turn in specimen coordinates to derived data only. Moment is unchanged. Inspect context before choosing.`:`Proposed specimen exchange; verify both specimens before approving.`;
 const reasonLabels={existing_bad_flag:'Already marked bad in a source table',high_csd:'High directional scatter: CSD exceeds 10°',elevated_csd_review:'Directional scatter needs review: CSD exceeds 4°',low_moment:'Moment is at least 100× below reliable nearby-temperature measurements'};
 const reasons=type==='exclusion'?e.reasons.map(r=>reasonLabels[r]||r):type==='possible_flip'?(e.origin==='manual'?[`Manual loading-flip proposal: ${e.model} half-turn`]:[`Possible loading flip: ${e.model} half-turn`,`Angular mismatch: ${Number(e.original_angle_degrees).toFixed(1)}° → ${Number(e.transformed_angle_degrees).toFixed(1)}°`,`Context: ${e.support.replaceAll('_',' ')}`]):[`Possible swap with ${e.partner_identity}`,`Both angular mismatches improve: ${e.original_angles_degrees.map(v=>v.toFixed(1)+'°').join(' / ')} → ${e.swapped_angles_degrees.map(v=>v.toFixed(1)+'°').join(' / ')}`];
 const explanations=explainFlag(e,type,row),warnings=reviewWarnings(e,type,row);
 const strongest=warnings.slice().sort((a,b)=>b.rank-a.rank)[0];
 $('case-warning').hidden=!strongest;
 if(strongest){$('case-warning').className='case-warning severity-'+strongest.level;$('case-warning').textContent=strongest.label+' — '+strongest.detail+' Review priority only; no error is proven.'}

 $('reasons').replaceChildren(...reasons.map((reason,index)=>{const li=document.createElement('li'),label=document.createElement('strong'),detail=document.createElement('p');const warning=warnings.find(w=>w.reason===(type==='exclusion'?e.reasons[index]:type));
 label.textContent=(warning?warning.label+' · ':'')+reason;
 li.className=warning?'reason-warning severity-'+warning.level:'';
 detail.textContent=explanations[index]||'';li.replaceChildren(label,detail);return li}));
 const csd=Number(row?.dir_csd);$('csd-warning').hidden=!(csd>4);$('csd-warning').textContent=csd>10?`High CSD: ${csd}° exceeds 10°`:`CSD warning: ${csd}° exceeds 4°`;
 $('csd-warning').style.cssText=csd>10?'background:#fde4e1;color:#a31e17;border-left:5px solid #c62828;padding:10px 14px;font-weight:650':'background:#fff0d9;color:#975300;border-left:5px solid #ef8c00;padding:10px 14px;font-weight:650';
 $('description').textContent=description;$('metadata').textContent=`Sources: ${card.datasets.join(', ')} · Moment: ${row?Number(row.magn_moment).toExponential(3):'?'} A·m² · CSD: ${row?row.dir_csd:'?'}° · Original quality: ${row?row.quality:'?'}`;
 $('note').value=e.review_note||'';$('evidence').textContent=JSON.stringify(e,null,2);$('decision').textContent=(e.status||'pending').toUpperCase();
 for(const [id,status] of [['yes','approved'],['no','rejected'],['undecided','pending']])$(id).setAttribute('aria-pressed',String((e.status||'pending')===status));
 const view=screenedRows(card.specimen),shown=view.find(r=>rowIdentity(r)===card.identity)||row;
 const preview=e.status==='pending'?proposed(row,e):null;
 if($('plot-view').value==='raw')$('plot-state').textContent='Before review: original recorded measurements. Decisions are not applied in this view.';
 if(row)drawReviewPlots($('plots'),view,shown,preview,{kelvinOffset:initial.temperature_offset_K??273.15,axis:$('vector-view').value,full:$('vector-context').value==='all',status:e.status});
 $('partner-card').hidden=type!=='possible_swap';if(type==='possible_swap'){
  const partner=rowFor(e.partner_identity);if(partner){
   drawReviewPlots($('plots'),view,shown,e.status==='pending'?partner:null,{kelvinOffset:initial.temperature_offset_K??273.15,axis:$('vector-view').value,full:$('vector-context').value==='all',status:e.status});
   const partnerView=screenedRows(partner.specimen),partnerShown=partnerView.find(r=>rowIdentity(r)===e.partner_identity)||partner;
   drawReviewPlots($('partner-plots'),partnerView,partnerShown,e.status==='pending'?row:null,{kelvinOffset:initial.temperature_offset_K??273.15,axis:$('vector-view').value,full:$('vector-context').value==='all',status:e.status});
  }
 }
 paintManualPreview();
}
function move(delta){if(reviewStage==='repeats'){moveRepeat(delta);return}if(delta>0&&position>=filtered().length-1){promptRepeatStage();return}repeatInspect=false;position+=delta;render();persist()}
function choose(status){
 const card=current();if(repeatInspect||!card||pendingChoice)return;
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
 if(pendingChoice.manual){commitManualProposal(pendingChoice.manual);dismissChoice();return}
 if(pendingChoice.repeat){const {group,identity,allBad}=pendingChoice.repeat;ledger.repeat_selections||={};ledger.repeat_selections[group.group_id]={...group,selected_identity:identity,...(allBad?{all_bad:true}:{})};dismissChoice();const next=repeatGroups().find(g=>!repeatResolved(g));if(next)$('repeat-group').value=next.group_id;render();persist();return}
 const {card,status,note}=pendingChoice;const before=filtered();
 const next=before[before.findIndex(c=>c.id===card.id&&c.section===card.section)+1];
 const e=entry(card);if(e.status!==status){e.decision_history||=[];e.decision_history.push({status:e.status,review_note:e.review_note||'',changed_at:new Date().toISOString()})}e.status=status;e.review_note=note;dismissChoice();
 const after=filtered();
 if(next){const index=after.findIndex(c=>c.id===next.id&&c.section===next.section);if(index>=0)position=index;}
 render();persist();
 if(!next){$('cache-state').textContent+=' · End of review list';promptRepeatStage()}
}
$('confirm-choice').onclick=confirmChoice;$('cancel-choice').onclick=dismissChoice;
$('confirm-dialog').oncancel=e=>{e.preventDefault();dismissChoice()};
$('prev').onclick=()=>move(-1);$('next').onclick=()=>move(1);$('yes').onclick=()=>choose('approved');$('no').onclick=()=>choose('rejected');$('undecided').onclick=()=>choose('pending');
$('filter').onchange=()=>{repeatInspect=false;position=0;render()};$('note').oninput=()=>{const card=current();if(card){entry(card).review_note=$('note').value;persist()}};
document.addEventListener('keydown',e=>{if(pendingChoice){if(e.key==='Enter'||e.key==='Escape'){e.preventDefault();if(!e.repeat){if(e.key==='Enter')confirmChoice();else dismissChoice()}}return}if(e.repeat)return;if($('stage-dialog').open)return;if(e.target.closest('input,textarea,select')||e.ctrlKey||e.metaKey||e.altKey)return;const k=e.key.toLowerCase();if(['arrowleft','arrowright','y','n','u'].includes(k)){e.preventDefault();if(k==='arrowleft')move(-1);if(k==='arrowright')move(1);if(k==='y')choose('approved');if(k==='n')choose('rejected');if(k==='u')choose('pending')}});
$('save').onclick=()=>{const blob=new Blob([JSON.stringify(ledger,null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='measurement_transformations.reviewed.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('cache-state').textContent='Decision file downloaded · source data unchanged'};
$('load').onchange=async e=>{try{const value=JSON.parse(await e.target.files[0].text());for(const card of initial.deck){const incoming=card.section==='exclusions'?value.exclusions[card.id]:value.review_candidates.find(r=>r.review_id===card.id);if(!incoming||!['pending','approved','rejected'].includes(incoming.status))throw Error('Review does not match this gallery');const old=entry(card);if(incoming.source_fingerprint!==old.source_fingerprint||incoming.partner_fingerprint!==old.partner_fingerprint)throw Error('Source observations changed');}for(const card of initial.deck){const incoming=card.section==='exclusions'?value.exclusions[card.id]:value.review_candidates.find(r=>r.review_id===card.id);Object.assign(entry(card),{status:incoming.status,review_note:incoming.review_note||''})}for(const incoming of value.review_candidates||[])if(incoming.origin==='manual'&&!ledger.review_candidates.some(e=>e.review_id===incoming.review_id)){const row=rowFor(incoming.identity);if(!['pending','approved','rejected'].includes(incoming.status)||incoming.type!=='possible_flip'||!row||row._source_fingerprint!==incoming.source_fingerprint||!['arrow-x','arrow-y'].includes(incoming.model)||incoming.review_id!=='manual-flip:'+incoming.identity+':'+incoming.model)throw Error('Manual flip source changed');ledger.review_candidates.push(incoming);initial.deck.push({section:'review_candidates',id:incoming.review_id,type:'possible_flip',specimen:row.specimen,identity:incoming.identity,datasets:['manual review']})}if(value.repeat_selections)ledger.repeat_selections=validatedRepeatSelections(value.repeat_selections);persist();render()}catch(error){alert(error.message)}};
function repeatGroups(){return Object.values(initial.repeat_groups||{}).map(group=>({...group,identities:group.identities.filter(id=>ledger.exclusions[id]?.status!=='approved'&&(!repeatContext||(repeatContext[group.specimen]||[]).some(r=>rowIdentity(r)===id)))})).filter(group=>group.identities.length>1)}
function repeatValid(group,choice){return choice?.signature===group.signature&&(choice.all_bad===true?choice.selected_identity===null&&JSON.stringify([...choice.identities].sort())===JSON.stringify([...group.identities].sort()):group.identities.includes(choice.selected_identity)&&ledger.exclusions[choice.selected_identity]?.status!=='approved')}
function repeatResolved(group){return repeatValid(group,ledger.repeat_selections?.[group.group_id])||group.identities.every(id=>ledger.exclusions[id]?.status==='approved')}
function validatedRepeatSelections(value){const result={};for(const group of repeatGroups()){const choice=value[group.group_id];if(choice&&repeatValid(group,choice))result[group.group_id]=choice}return result}
function selectedRepeat(){return repeatGroups().find(g=>g.group_id===$('repeat-group').value)}
function showRepeatMembers(){const group=selectedRepeat();$('repeat-all-bad').disabled=!group;if(!group)return;const choice=ledger.repeat_selections?.[group.group_id],previous=$('repeat-member').value;$('repeat-member').replaceChildren(...group.identities.map(id=>{const option=document.createElement('option'),row=(repeatContext?.[group.specimen]||[]).find(r=>rowIdentity(r)===id)||rowFor(id);option.value=id;option.textContent=`${id.split('|')[1]} · CSD ${row.dir_csd}° · ${Number(row.magn_moment).toExponential(3)} A·m²${ledger.exclusions[id]?.status==='approved'?' · EXCLUDED':''}`;option.disabled=ledger.exclusions[id]?.status==='approved';return option}));$('repeat-member').value=group.identities.includes(previous)&&ledger.exclusions[previous]?.status!=='approved'?previous:repeatValid(group,choice)?choice.selected_identity:group.identities.find(id=>ledger.exclusions[id]?.status!=='approved')||'';$('repeat-choose').disabled=!$('repeat-member').value}
function renderRepeats(){const groups=repeatGroups();$('repeat-review').hidden=reviewStage!=='repeats';const old=$('repeat-group').value;$('repeat-group').replaceChildren(...groups.map(group=>{const option=document.createElement('option');option.value=group.group_id;option.textContent=`${repeatResolved(group)?'✓':'REQUIRED'} ${group.specimen} · ${(group.treat_temp-(initial.temperature_offset_K??273.15)).toFixed(1)}°C · ${group.identities.length} measurements`;return option}));$('repeat-group').value=groups.some(g=>g.group_id===old)?old:groups.find(g=>!repeatResolved(g))?.group_id||groups[0]?.group_id||'';$('repeat-status').textContent=`${groups.filter(g=>!repeatResolved(g)).length} repeated-temperature groups still require a choice. Only surviving measurements are included; temperatures with one survivor need no further choice.`;showRepeatMembers();const index=groups.findIndex(g=>g.group_id===$('repeat-group').value);$('repeat-previous').disabled=index<=0;$('repeat-next').disabled=index<0||index>=groups.length-1}
function selectRepeat(identity){if(pendingChoice)return;const group=selectedRepeat();if(!group?.identities.includes(identity))return;if(ledger.exclusions[identity]?.status==='approved'){$('repeat-status').textContent='This observation has an approved exclusion; reassess that exclusion before retaining it.';return}$('repeat-member').value=identity;inspectRepeat()}
// Conservative repeat-group warning: require reliable bracketing levels, never extrapolate.
function repeatConcern(group,candidates,context){
 const numeric=v=>v!==''&&v!=null&&Number.isFinite(Number(v));
 const angular=(a,b)=>{const vector=r=>{const d=Number(r.dir_dec)*Math.PI/180,i=Number(r.dir_inc)*Math.PI/180;return [Math.cos(i)*Math.cos(d),Math.cos(i)*Math.sin(d),Math.sin(i)]};const x=vector(a),y=vector(b);return Math.acos(Math.max(-1,Math.min(1,x.reduce((sum,v,j)=>sum+v*y[j],0))))*180/Math.PI};
 const rejectedByRepeat=row=>Object.values(initial.repeat_groups||{}).some(g=>{const group={...g,identities:g.identities.filter(id=>ledger.exclusions[id]?.status!=='approved')},choice=ledger.repeat_selections?.[g.group_id];return group.identities.includes(rowIdentity(row))&&repeatValid(group,choice)&&(choice.all_bad||rowIdentity(row)!==choice.selected_identity)});
 const good=context.filter(r=>!r._screened_out&&!rejectedByRepeat(r)&&ledger.exclusions[rowIdentity(r)]?.status!=='approved'&&r.quality!=='b'&&[r.treat_temp,r.dir_dec,r.dir_inc,r.dir_csd,r.magn_moment].every(numeric)&&Number(r.dir_csd)<=4&&Number(r.magn_moment)>0&&Math.abs(Number(r.treat_temp)-group.treat_temp)<=25);
 const lo=Math.max(...good.filter(r=>Number(r.treat_temp)<group.treat_temp).map(r=>Number(r.treat_temp))),hi=Math.min(...good.filter(r=>Number(r.treat_temp)>group.treat_temp).map(r=>Number(r.treat_temp)));
 if(!Number.isFinite(lo)||!Number.isFinite(hi))return null;
 const refs=good.filter(r=>[lo,hi].includes(Number(r.treat_temp)));
 if(refs.some(a=>refs.some(b=>angular(a,b)>20)))return null;
 const reasons=candidates.map(row=>{const result=[];
  if(numeric(row.dir_csd)&&Number(row.dir_csd)>4)result.push(`CSD ${Number(row.dir_csd).toFixed(1)}° exceeds 4°`);
  if([row.dir_dec,row.dir_inc].every(numeric)&&refs.every(ref=>angular(row,ref)>=30))result.push('direction differs by ≥30° from both bracketing levels');
  const moments=refs.map(r=>Number(r.magn_moment));
  if(numeric(row.magn_moment)&&Math.max(...moments)/Math.min(...moments)<=10){const m=Number(row.magn_moment);if(m>=0&&refs.every(ref=>m<=Number(ref.magn_moment)*.01))result.push('moment is ≥100× weaker than both bracketing levels');if(refs.every(ref=>m>=Number(ref.magn_moment)*100))result.push('moment is ≥100× stronger than both bracketing levels');}
  return result;
 });
 if(!reasons.length||reasons.some(list=>!list.length))return null;
 const offset=initial.temperature_offset_K??273.15;
 return {before:lo-offset,after:hi-offset,reasons};
}
function inspectRepeat(){if(reviewStage!=='repeats')return;repeatInspect=true;const group=selectedRepeat();if(!group)return;const identity=$('repeat-member').value||group.identities[0];$('repeat-choose').disabled=!group.identities.includes($('repeat-member').value);const row=rowFor(identity);$('empty').hidden=true;$('case').hidden=false;$('kind').textContent='Repeated temperature';$('title').textContent=`${group.specimen} · ${(group.treat_temp-(initial.temperature_offset_K??273.15)).toFixed(1)}°C`;$('description').textContent='Every repeat is plotted together. Click a colored point, numbered callout, or candidate button to select it. H/V labels identify horizontal/vertical vector projections. Overlapping points have separate numbered callouts. Selection alone does not save a decision; use Keep selected measurement to confirm.';$('reasons').replaceChildren();$('metadata').textContent=identity;$('case-warning').hidden=true;$('csd-warning').hidden=true;$('partner-card').hidden=true;$('decision').textContent=repeatResolved(group)?(ledger.repeat_selections[group.group_id]?.all_bad?'ALL MEASUREMENTS FLAGGED BAD':'REPEAT GROUP RESOLVED'):'REPEAT CHOICE REQUIRED';for(const id of ['yes','no','undecided','note'])$(id).disabled=true;
 const colors=group.identities.map((_,i)=>`hsl(${(i*137.508)%360},75%,${darkMode?70:38}%)`);
 // Retained/excluded repeats stay equally visible during comparison. Apply
 // approved direction corrections, but do not hide nonwinning candidates.
 const view=(repeatContext?.[group.specimen]||[]).map(r=>({...r}));
 const candidates=group.identities.map(id=>view.find(r=>rowIdentity(r)===id)||rowFor(id));
 $('repeat-options').hidden=false;$('repeat-options').replaceChildren(...candidates.map((candidate,i)=>{const id=group.identities[i],button=document.createElement('button');button.type='button';button.className='repeat-candidate';button.style.cssText='--candidate-color:'+colors[i];button.setAttribute('aria-pressed',String(id===identity));button.disabled=ledger.exclusions[id]?.status==='approved';button.textContent=`Measurement ${i+1}${button.disabled?' · EXCLUDED':''}${id===identity?' · SELECTED':''}`;const measured=document.createElement('small');measured.textContent=candidate.timestamp.replace('T',' · ');button.append(measured);const metrics=document.createElement('div');metrics.className='candidate-metrics';for(const [label,value,severity] of [['Direction',`${Number(candidate.dir_dec).toFixed(1)}° D / ${Number(candidate.dir_inc).toFixed(1)}° I`,''],['CSD',`${candidate.dir_csd}°`,Number(candidate.dir_csd)>10?'candidate-csd-red':Number(candidate.dir_csd)>4?'candidate-csd-orange':''],['Moment',`${Number(candidate.magn_moment).toExponential(3)} A·m²`,'']]){const item=document.createElement('span'),name=document.createElement('strong'),detail=document.createElement('span');name.textContent=label;detail.textContent=value;detail.className=severity;item.append(name,detail);metrics.append(item)}button.append(metrics);button.onclick=()=>selectRepeat(id);return button}));
 const concern=repeatConcern(group,candidates,view);
 if(concern){
  $('case-warning').hidden=false;$('case-warning').className='case-warning severity-orange';$('case-warning').textContent='ALL REPEATS NEED A SECOND LOOK — consider “No good measurements”.';
  const explanation=document.createElement('p');explanation.textContent=`Compared with reliable retained levels at ${concern.before.toFixed(1)}°C and ${concern.after.toFixed(1)}°C (CSD ≤4°, directions agree within 20°, each within 25°C). This is a screening suggestion; a real magnetic change remains possible.`;$('reasons').append(explanation);
  concern.reasons.forEach((reasons,i)=>{const li=document.createElement('li');li.textContent=`Measurement ${i+1} (${candidates[i].timestamp}): ${reasons.join('; ')}.`;$('reasons').append(li)});
  $('repeat-all-bad').className='reject prominent-all-bad';
 }else $('repeat-all-bad').className='reject';
 const shown=view.find(r=>rowIdentity(r)===identity)||row;
 drawReviewPlots($('plots'),view,shown,null,{kelvinOffset:initial.temperature_offset_K??273.15,axis:$('vector-view').value,full:$('vector-context').value==='all',repeatCandidates:candidates,candidateColors:colors,selectedIdentity:identity,onCandidateClick:selectRepeat,onCandidateOverlap:()=>{$('repeat-status').textContent='These points overlap. Click their separate numbered callouts or candidate buttons to choose explicitly.'}});paintManualPreview();
 $('plot-state').textContent='Repeat comparison: every option is shown together at full opacity. Colors and numbers match the candidate buttons. Selecting is a preview; confirmation saves the choice.';
}
$('repeat-group').onchange=()=>{showRepeatMembers();inspectRepeat()};$('repeat-open').onclick=()=>{$('vector-context').value='local';inspectRepeat()};$('repeat-member').onchange=inspectRepeat;
$('repeat-choose').onclick=()=>{const group=selectedRepeat(),identity=$('repeat-member').value;if(!group||!identity||pendingChoice)return;pendingChoice={repeat:{group,identity},focus:document.activeElement};$('confirm-measurement').textContent=group.group_id;$('confirm-message').textContent=`Retain ${identity.split('|')[1]} and exclude the other ${group.identities.length-1} repeats from derived fits. Enter confirms; Esc reassesses.`;$('confirm-dialog').showModal()};
$('repeat-all-bad').onclick=()=>{const group=selectedRepeat();if(!group||pendingChoice)return;pendingChoice={repeat:{group,identity:null,allBad:true},focus:document.activeElement};$('confirm-measurement').textContent=group.group_id;$('confirm-message').textContent=`Flag ALL ${group.identities.length} surviving measurements at this temperature bad. None will be retained in derived fits. Raw observations remain intact. Enter confirms; Esc reassesses.`;$('confirm-dialog').showModal()};
function paintStage(){const repeats=reviewStage==='repeats';$('plot-view').disabled=repeats;for(const id of ['quality-navigation','quality-intro','quality-finish','quality-choices','quality-notes'])$(id).hidden=repeats;$('repeat-review').hidden=!repeats;$('repeat-controls').hidden=!repeats;$('repeat-navigation').hidden=!repeats;$('review-heading').textContent=repeats?'Repeated-temperature review':'Measurement review';$('review-shortcuts').textContent=repeats?'← → browse temperatures · click a numbered candidate · Keep selected measurement · Enter confirms · Esc reassesses':'← → browse · Y approve · N reject · U undecided · Enter confirms · Esc reassesses';}
function promptRepeatStage(){if(reviewStage!=='quality'||stageBusy)return;const pending=initial.deck.filter(c=>(entry(c).status||'pending')==='pending').length;$('stage-message').textContent=`Apply your approved exclusions and corrections, then review only the repeated temperatures that remain? ${pending?pending+' proposals remain undecided; they will stay unchanged.':'All proposals have decisions.'} Raw source data stay intact.`;$('stage-error').textContent='';$('stage-dialog').showModal()}
let applyReviewStage=async()=>true;
function buildRepeatContext(){const previous=$('plot-view').value;$('plot-view').value='screened';const result={};try{for(const specimen of Object.keys(initial.context)){const rows=screenedRows(specimen,{ignoreRepeatSelections:true}).filter(r=>!r._screened_out);if($('plot-state').textContent.startsWith('Conflicting'))throw Error('Resolve conflicting approved exclusions/corrections before applying.');if(rows.length)result[specimen]=rows}}finally{$('plot-view').value=previous}return result}
async function beginRepeatStage(){if(stageBusy)return;stageBusy=true;$('stage-apply').disabled=true;$('stage-error').textContent='Applying decisions…';try{persist();const context=buildRepeatContext();if(!await applyReviewStage())throw Error('Could not apply decisions. Stay here and try again.');repeatContext=context;reviewStage='repeats';repeatInspect=repeatGroups().length>0;$('vector-context').value='local';$('stage-dialog').close();render();if(!repeatInspect){$('case').hidden=true;$('empty').hidden=false;$('empty').textContent='No repeated temperatures remain after applying your bad-measurement decisions.'}persist()}catch(error){$('stage-error').textContent=error.message}finally{stageBusy=false;$('stage-apply').disabled=false}}
function moveRepeat(delta){const groups=repeatGroups(),index=groups.findIndex(g=>g.group_id===$('repeat-group').value);const next=groups[Math.max(0,Math.min(groups.length-1,index+delta))];if(next){$('repeat-group').value=next.group_id;showRepeatMembers();inspectRepeat()}}
$('finish-quality').onclick=promptRepeatStage;$('stage-apply').onclick=beginRepeatStage;$('stage-cancel').onclick=()=>{if(!stageBusy)$('stage-dialog').close()};$('stage-dialog').oncancel=e=>{if(stageBusy)e.preventDefault()};
$('back-quality').onclick=()=>{reviewStage='quality';repeatInspect=false;repeatContext=null;render()};$('repeat-previous').onclick=()=>moveRepeat(-1);$('repeat-next').onclick=()=>moveRepeat(1);
$('finish-repeats').onclick=async()=>{const pending=repeatGroups().filter(g=>!repeatResolved(g)).length;if(pending){$('repeat-status').textContent=`Choose one measurement or flag all bad for each of the ${pending} remaining repeated temperatures before applying.`;return}try{persist();if(!await applyReviewStage())throw Error('Could not apply repeat choices');$('repeat-status').textContent='Repeat choices applied. Save a decision-file backup; reload and recalculate your fits.'}catch(error){$('repeat-status').textContent=error.message}};
function manualRow(){return reviewStage==='repeats'?rowFor($('repeat-member').value):rowFor(current()?.identity||'')}
function paintManualPreview(){
 const row=manualRow(),active=!!row&&manualPreview?.identity===rowIdentity(row)&&manualPreview.stage===reviewStage;
 if(!active)manualPreview=null;
 $('manual-preview-button').textContent=active?'Stop flip preview':'Preview loading flip';$('manual-preview-button').setAttribute('aria-pressed',String(active));$('manual-propose').hidden=!active;$('manual-preview-values').hidden=!active;
 $('manual-status').textContent=active?'PREVIEW ONLY · teal = proposed flip. No decision changed.':'';
 if(!active)return;
 const change=proposed(row,{type:'possible_flip',model:manualPreview.model});
 $('manual-preview-values').textContent=`Recorded D ${Number(row.dir_dec).toFixed(1)}°, I ${Number(row.dir_inc).toFixed(1)}° → Preview: D ${change.dir_dec.toFixed(1)}°, I ${change.dir_inc.toFixed(1)}°. Moment unchanged. Verify the physical loading axis.`;
 const view=(reviewStage==='repeats'?(repeatContext?.[row.specimen]||[]):screenedRows(row.specimen)).map(r=>rowIdentity(r)===rowIdentity(row)?{...row}:r);
 const group=reviewStage==='repeats'?selectedRepeat():null,candidates=group?group.identities.map(id=>view.find(r=>rowIdentity(r)===id)||rowFor(id)):undefined;
 drawReviewPlots($('plots'),view,row,change,{kelvinOffset:initial.temperature_offset_K??273.15,axis:$('vector-view').value,full:$('vector-context').value==='all',status:'manual preview only',repeatCandidates:candidates,candidateColors:group?group.identities.map((_,i)=>`hsl(${(i*137.508)%360},75%,${darkMode?70:38}%)`):undefined,selectedIdentity:rowIdentity(row),onCandidateClick:selectRepeat});
 $('plot-state').textContent='PREVIEW ONLY · recorded measurement in pink; proposed loading half-turn in teal. Saved decisions unchanged.';
}
function previewManualFlip(){const row=manualRow();if(!row)return;manualPreview={identity:rowIdentity(row),stage:reviewStage,model:$('manual-model').value||'arrow-x'};render()}
$('manual-preview-button').onclick=()=>{if(manualPreview){manualPreview=null;render()}else previewManualFlip()};
$('manual-model').onchange=()=>{if(manualPreview)previewManualFlip()};
$('manual-propose').onclick=()=>{const row=manualRow();if(!row||pendingChoice)return;if(!row._source_fingerprint){$('manual-status').textContent='Regenerate or reload this bundle to include measurement fingerprints.';return}previewManualFlip();pendingChoice={manual:{identity:rowIdentity(row),model:$('manual-model').value},focus:document.activeElement};$('confirm-measurement').textContent=row.specimen+' · '+row.timestamp;$('confirm-message').textContent='Create a PENDING manual flip proposal? This does not approve a correction or change earlier proposals. Enter creates the proposal; Esc returns to preview. Review and approve separately.';$('confirm-dialog').showModal()};
function commitManualProposal({identity,model}){const row=rowFor(identity),id='manual-flip:'+identity+':'+model;let proposal=ledger.review_candidates.find(e=>e.review_id===id);if(!proposal){proposal={review_id:id,identity,type:'possible_flip',origin:'manual',model,status:'pending',source_fingerprint:row._source_fingerprint,support:'manual_review',disposition:'review'};ledger.review_candidates.push(proposal)}if(!initial.deck.some(c=>c.id===id&&c.section==='review_candidates'))initial.deck.push({section:'review_candidates',id,type:'possible_flip',specimen:row.specimen,identity,datasets:['manual review']});reviewStage='quality';repeatInspect=false;$('filter').value='all';position=filtered().findIndex(c=>c.id===id);render();persist();$('manual-status').textContent=proposal.status==='pending'?'Manual flip proposal created. Approve it only after inspecting the preview.':'Existing manual flip proposal opened; its saved decision is unchanged. Use Y/N/U to reassess.'}
$('manual-revisit').onclick=()=>{reviewStage='quality';repeatInspect=false;$('filter').value='rejected';position=0;render();manualPreview=null;$('manual-status').textContent='Reviewing previously rejected proposals. Original decisions remain unchanged; use the current measurement to preview either flip model.'};
manualPreview=null;
function syncStickyHeader(){const header=document.querySelector?.('header');if(!header)return;document.documentElement.style?.setProperty('--review-header-height',Math.ceil(header.getBoundingClientRect().height)+'px')}
if(typeof ResizeObserver!=='undefined'){const header=document.querySelector?.('header');if(header)new ResizeObserver(syncStickyHeader).observe(header)}window.addEventListener('resize',syncStickyHeader);syncStickyHeader();
window.addEventListener('resize',render);render();

// Refit plots when tool drawers or review stages change the available workspace.
if(typeof ResizeObserver!=='undefined'){const pane=document.querySelector?.('.review-plots');if(pane)new ResizeObserver(()=>render()).observe(pane)}
