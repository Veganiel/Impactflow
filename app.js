import { base58Encode, buildVersionedNonce } from './near-intents-auth.js';

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];

const projects={paws:{name:'A second chance for every paw.',org:'Paws & Hope Foundation'},roots:{name:'Bring a forest back to life.',org:'Roots for Tomorrow'},wild:{name:'Give wildlife room to recover.',org:'Wild Again Network'}};

let selectedAmount=25,connectedAccount=null,nearConnector=null,nearConnectorPromise=null,nearConnectorClass=null,intentsConnector=null,intentsWallet=null,intentsAccount=null,confidentialAccessToken=null,confidentialRefreshToken=null,confidentialTokenExpiresAt=0,supportedTokens=[],currentUser=null,intentPayload=null,intentDeposit=null,contractAdmin=null,escrowContractId='impactflow-escrow-xyz.testnet';

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const txLink=hash=>hash?` <a class="tx-link" href="https://testnet.nearblocks.io/txns/${encodeURIComponent(hash)}" target="_blank" rel="noopener noreferrer">View transaction ${esc(String(hash).slice(0,8))}… ↗</a>`:'';

function toast(m){const e=$('#toast');e.textContent=m;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),3500)}

let lastModalTrigger=null;
function openModal(html){
 const backdrop=$('#modalBackdrop');
 if(!backdrop.classList.contains('open'))lastModalTrigger=document.activeElement;
 $('#modalContent').innerHTML=html;
 backdrop.classList.add('open');backdrop.setAttribute('aria-hidden','false');document.body.classList.add('modal-open');
 requestAnimationFrame(()=>{const first=$('#modal').querySelector('input,select,textarea,button:not(.modal-close),a[href]')||$('#modalClose');first.focus();});
}

function closeModal(){
 const backdrop=$('#modalBackdrop');backdrop.classList.remove('open');backdrop.setAttribute('aria-hidden','true');document.body.classList.remove('modal-open');
 requestAnimationFrame(()=>lastModalTrigger?.isConnected&&lastModalTrigger.focus());
}

function showDemoReceipt({project,amount,privateDisplay}){
 openModal(`<div class="eyebrow">LOCAL DEMO · NO PAYMENT</div><h2 id="modalTitle">Demo preview complete.</h2><p>This interaction is only a product preview. No wallet was contacted, no funds moved, and nothing was saved or sent.</p><dl class="demo-receipt"><div><dt>Initiative</dt><dd>${esc(project.name)}</dd></div><div><dt>Preview amount</dt><dd>$${amount.toLocaleString('en-US')}</dd></div><div><dt>Display preference</dt><dd>${privateDisplay?'Hide identity in this demo view':'No privacy preference selected'}</dd></div></dl><p class="modal-note">The privacy checkbox applies to this preview only. It does not make a real donation anonymous.</p><button class="btn btn-primary" id="receiptDoneBtn">Back to initiatives</button><a class="text-link receipt-intents-link" href="#intents">Explore cross-chain routing ↗</a>`);
 $('#receiptDoneBtn').addEventListener('click',()=>{closeModal();$('#explore').scrollIntoView({behavior:'smooth',block:'start'});});
 $('#modalContent .receipt-intents-link').addEventListener('click',closeModal);
}

async function api(url,options={}){
 const {headers:extraHeaders={},...requestOptions}=options;
 const response=await fetch(url,{credentials:'same-origin',...requestOptions,headers:{'Content-Type':'application/json',...extraHeaders}});
 let data={};try{data=await response.json()}catch{}
 if(!response.ok){const error=new Error(data.error||data.message||`Request failed (${response.status})`);error.status=response.status;throw error;}
 return data;
}

function accountModal(mode='register'){
 const register=mode==='register';openModal(`<div class="eyebrow">IMPACTFLOW ACCOUNT</div><h2 id="modalTitle">${register?'Create your account.':'Welcome back.'}</h2><p>${register?'Create a secure login first. You can then register an organization or company profile.':'Sign in to manage your organization and campaigns.'}</p><label for="authEmail">EMAIL</label><input id="authEmail" type="email" autocomplete="email" placeholder="you@example.org" maxlength="254"><label for="authPassword">PASSWORD</label><input id="authPassword" type="password" autocomplete="${register?'new-password':'current-password'}" minlength="12" placeholder="${register?'At least 12 characters':'Your password'}" maxlength="200"><button class="btn btn-primary" id="authSubmit">${register?'Create account':'Sign in'} ↗</button><p class="modal-note">${register?'Use at least 12 characters. This prototype stores a salted password hash on its local backend.':'Your session cookie is HttpOnly and expires after 7 days.'}</p><p><a href="#" id="authSwitch">${register?'Already registered? Sign in':'Need an account? Register'}</a></p>`);
}

function organizationModal(){openModal(`<div class="eyebrow">ORGANIZATION ONBOARDING</div><h2 id="modalTitle">Build your impact profile.</h2><p>Organizations of every kind can apply: nonprofits, companies, communities and public institutions.</p><label for="orgType">ACCOUNT TYPE</label><select id="orgType"><option value="ngo">NGO / Non-profit</option><option value="company">Company / Corporate partner</option><option value="community">Community group</option><option value="public">Public institution</option><option value="individual">Individual project creator</option></select><label for="orgName">ORGANIZATION NAME</label><input id="orgName" maxlength="100" placeholder="Your organization name"><label for="orgCountry">COUNTRY</label><input id="orgCountry" maxlength="80" placeholder="Country of registration"><label for="orgWebsite">WEBSITE (OPTIONAL)</label><input id="orgWebsite" type="url" maxlength="240" placeholder="https://example.org"><label for="orgCause">PRIMARY IMPACT AREA</label><select id="orgCause"><option>Animal welfare</option><option>Nature & climate</option><option>Social justice</option><option>Humanitarian aid</option><option>Public health</option><option>Education</option><option>Other public benefit</option></select><button class="btn btn-primary" id="saveOrgBtn">Save organization ↗</button><p class="modal-note">Profiles are marked unverified. Registration is not legal identity verification, nonprofit accreditation or due diligence.</p>`)}

function projectModal(){openModal(`<div class="eyebrow">PROJECT SUBMISSION</div><h2 id="modalTitle">Submit an impact project.</h2><p>Send a project proposal to the local review queue. This prototype does not create a blockchain campaign or move funds.</p><label for="projectTitle">PROJECT TITLE</label><input id="projectTitle" maxlength="120" placeholder="What change will this project make?"><label for="projectCategory">IMPACT AREA</label><select id="projectCategory"><option value="animals">Animal welfare</option><option value="nature">Nature & climate</option><option value="social">Social justice</option><option value="humanitarian">Humanitarian aid</option><option value="health">Public health</option><option value="education">Education</option><option value="other">Other public benefit</option></select><label for="projectFundingModel">FUNDING MODEL</label><select id="projectFundingModel"><option value="targeted">Campaign with a funding target</option><option value="ongoing">Ongoing organization fund · no target</option></select><div id="projectGoalField"><label for="projectGoal">FUNDING GOAL (USD EQUIVALENT)</label><input id="projectGoal" type="number" min="50" max="10000000" step="1" placeholder="At least 50"></div><label for="projectDescription">PROJECT DESCRIPTION</label><textarea id="projectDescription" rows="5" maxlength="1200" placeholder="Describe the intended outcomes, activities and how you will prove impact."></textarea><div class="agent-callout"><strong>Project Readiness Agent · NEAR AI</strong><p>With your approval, the title, impact area, funding model, target amount (if any) and description are sent to NEAR AI Cloud for an AI review. The result is advice only and does not verify or approve the project. Do not include personal or confidential documents.</p></div><button class="btn btn-outline" id="runProjectAgentBtn">Review project readiness with AI</button><div id="projectAgentResult" class="agent-result" aria-live="polite" hidden></div><button class="btn btn-primary" id="submitProjectBtn">Submit for review ↗</button><p class="modal-note">New proposals are marked pending review. Organization profiles are not independently verified.</p>`)}

function nearToYocto(value) {
  const raw = String(value ?? '').trim();
  const parts = raw.split('.');
  const whole = parts[0];
  const fraction = parts[1] || '';

  const isDigits = s =>
    s.length > 0 && [...s].every(c => c >= '0' && c <= '9');

  if (!isDigits(whole) || parts.length > 2 ||
      (fraction && !isDigits(fraction)) || fraction.length > 24) {
    throw new Error('Enter a valid NEAR amount.');
  }

  const yocto =
    BigInt(whole) * 1000000000000000000000000n +
    BigInt((fraction + '0'.repeat(24)).slice(0, 24));

  if (yocto <= 0n) {
    throw new Error('The funding goal must be greater than zero.');
  }

  return yocto.toString();
}


function donationToYocto(value) {
  const raw = String(value ?? '').trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,10})?$/.test(raw)) {
    throw new Error('Enter a valid amount with up to 10 decimal places.');
  }
  const [whole, fraction = ''] = raw.split('.');
  const yocto = BigInt(whole) * 10n ** 24n +
    BigInt((fraction + '0'.repeat(24)).slice(0, 24));
  if (yocto < 10n ** 22n) throw new Error('Minimum donation is 0.01 NEAR.');
  if (yocto > 10000n * 10n ** 24n) throw new Error('Maximum donation is 10,000 NEAR.');
  return yocto.toString();
}

function intentsToBaseUnits(value,decimals){
 const raw=String(value??'').trim();
 const precision=Number(decimals);
 if(!Number.isInteger(precision)||precision<0||precision>30)throw new Error('The selected asset has unsupported decimal precision.');
 if(!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(raw))throw new Error('Enter a positive amount using digits and a decimal point.');
 const [whole,fraction='']=raw.split('.');
 if(fraction.length>precision)throw new Error(`This asset supports at most ${precision} decimal places.`);
 const scale=10n**BigInt(precision);
 const fractionalUnits=BigInt((fraction+'0'.repeat(precision)).slice(0,precision)||'0');
 const amount=BigInt(whole)*scale+fractionalUnits;
 if(amount<=0n)throw new Error('The amount must be greater than zero.');
 return amount.toString();
}

function syncIntentsAmountLabel(){
 const option=$('#originAsset')?.selectedOptions?.[0];
 if(!option)return;
 const symbol=option.textContent.split('·')[0].trim()||'token';
 const decimals=Number(option.dataset.decimals)||0;
 $('#intentAmountLabel').textContent=`AMOUNT (${symbol})`;
 $('#intentAmountHint').textContent=`Enter ${symbol} in normal units; up to ${decimals} decimal places. The API receives the token's smallest units.`;
}

function syncIntentsAddressLabels(){
 const source=$('#originAsset')?.selectedOptions?.[0]?.dataset.chain||'source network';
 const destination=$('#destinationAsset')?.selectedOptions?.[0]?.dataset.chain||'destination network';
 $('#intentRecipientLabel').textContent=`RECIPIENT ADDRESS (${destination})`;
 $('#intentRefundLabel').textContent=`REFUND ADDRESS (${source})`;
 $('#intentRecipient').placeholder=`Address that can receive this asset on ${destination}`;
 $('#intentRefund').placeholder=`Address that can receive a refund on ${source}`;
}

function renderOrganization(org){const el=$('#orgProfileStatus');if(!el)return;if(!org){el.innerHTML='<span class="profile-empty">Sign in and register an organization to unlock the campaign workspace.</span>';return;}el.innerHTML=`<div class="profile-card"><span class="eyebrow">${esc(org.status||'unverified').toUpperCase()} · ORGANIZATION PROFILE</span><h3>${esc(org.name)}</h3><p>${esc(org.type)} · ${esc(org.cause)} · ${esc(org.country)}</p><small>${org.wallet?'NEAR wallet linked: '+esc(org.wallet):'No NEAR wallet linked'}</small><div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-outline" id="editOrgBtn">Edit profile</button><button class="btn btn-outline" id="logoutBtn">Sign out</button></div></div>`;loadMyProjects();}

async function refreshAccount(){try{const {user}=await api('/api/auth/me');currentUser=user;if(user){const {organization}=await api('/api/organizations/me');renderOrganization(organization);$('#registerBtn').textContent='My account';}else{renderOrganization(null);$('#registerBtn').textContent='Register';$('#myProjects').innerHTML='';}}catch{currentUser=null;renderOrganization(null)}}

async function loadMyProjects(){if(!currentUser)return;try{const {projects}=await api('/api/projects/mine');const box=$('#myProjects');if(!box)return;box.innerHTML=`<div class="eyebrow">CAMPAIGN WORKSPACE</div><h3>Your project submissions</h3>${projects.length?projects.map(p=>`<div class="my-project"><strong>${esc(p.title)}</strong><span>${esc(p.category)} · ${p.fundingModel==='ongoing'?'Ongoing fund · no target':`$${Number(p.goal).toLocaleString()}`} · ${esc(p.status)}</span></div>`).join(''):'<p class="profile-empty">No project submissions yet. Use “Submit a project” to create one.</p>'}`;}catch(e){console.warn(e)}}

$('#modalClose').addEventListener('click',closeModal);$('#modalBackdrop').addEventListener('click',e=>{if(e.target.id==='modalBackdrop')closeModal()});
document.addEventListener('keydown',e=>{
 const modal=$('#modal'),backdrop=$('#modalBackdrop');
 if(backdrop.classList.contains('open')){
  if(e.key==='Escape'){e.preventDefault();closeModal();return;}
  if(e.key==='Tab'){
   const focusable=[...modal.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(el=>el.offsetParent!==null);
   if(!focusable.length)return;
   if(e.shiftKey&&document.activeElement===focusable[0]){e.preventDefault();focusable.at(-1).focus();}
   else if(!e.shiftKey&&document.activeElement===focusable.at(-1)){e.preventDefault();focusable[0].focus();}
  }
  return;
 }
 if(e.key==='Escape')closeMenu();
});

$('#filters').addEventListener('click',e=>{const b=e.target.closest('[data-filter]');if(!b)return;$$('.filter').forEach(x=>x.classList.toggle('active',x===b));$$('.project-card').forEach(c=>c.classList.toggle('hidden',b.dataset.filter!=='all'&&c.dataset.category!==b.dataset.filter));});

$$('.contribute').forEach(b=>b.addEventListener('click',()=>{const p=projects[b.dataset.project];if(!p)return;selectedAmount=25;openModal(`<div class="eyebrow">SUPPORT AN INITIATIVE</div><h2 id="modalTitle">${esc(p.name)}</h2><p>Preview how support could help ${esc(p.org)} move toward its goal.</p><label>CHOOSE A PREVIEW AMOUNT (USD EQUIVALENT)</label><div class="amounts">${[10,25,50,100].map(n=>`<button class="amount ${n===25?'active':''}" data-amount="${n}">$${n}</button>`).join('')}</div><label for="customAmount">CUSTOM AMOUNT</label><input id="customAmount" type="number" min="1" max="10000" placeholder="Enter amount"><label class="privacy-choice"><input id="confidentialDonation" type="checkbox"><span><strong>Demo display preference</strong><small>Hide identity in this local preview only; no activity record is created.</small></span></label><div class="privacy-disclosure"><strong>Privacy note</strong><br>This only controls the app's display preference. Confidential Intents can reduce public visibility of supported swap details, but does not make a user anonymous to all parties.</div><p class="modal-note">Demo only. No wallet transaction or real payment will occur.</p><button class="btn btn-primary" id="confirmContribution">Continue in demo ↗</button>`);$$('.amount').forEach(x=>x.addEventListener('click',()=>{selectedAmount=Number(x.dataset.amount);$('#customAmount').value='';$$('.amount').forEach(y=>y.classList.toggle('active',y===x))}));$('#customAmount').addEventListener('input',()=>$$('.amount').forEach(x=>x.classList.remove('active')));$('#confirmContribution').addEventListener('click',()=>{const n=Number($('#customAmount').value)||selectedAmount;if(!Number.isFinite(n)||n<=0||n>10000)return toast('Enter a valid amount up to $10,000.');const privateDisplay=$('#confidentialDonation').checked;showDemoReceipt({project:p,amount:n,privateDisplay})});}));

async function loadNearConnectorClass(){if(!nearConnectorClass){const module=await import('@hot-labs/near-connect');nearConnectorClass=module.NearConnector;}return nearConnectorClass;}
async function initNearConnect(){
 if(nearConnector)return nearConnector;
 if(!nearConnectorPromise)nearConnectorPromise=(async()=>{try{
  const Connector=await loadNearConnectorClass();nearConnector=new Connector({network:'testnet',features:{signInWithoutAddKey:true},footerBranding:null});
  nearConnector.on('wallet:signIn',async({accounts})=>{connectedAccount=accounts?.[0]?.accountId||null;updateWalletUI();if(connectedAccount&&currentUser){try{await api('/api/organizations/wallet',{method:'PATCH',body:JSON.stringify({wallet:connectedAccount})});await refreshAccount()}catch{}}toast(connectedAccount?`Connected: ${connectedAccount}`:'NEAR wallet connected.');loadOnchainCampaign();});
  nearConnector.on('wallet:signOut',()=>{connectedAccount=null;updateWalletUI();toast('Wallet disconnected.');loadOnchainCampaign()});return nearConnector;
 }catch(error){console.error('NEAR Connect initialization failed',error);toast('Testnet wallet connection is unavailable. Other page features remain available.');nearConnectorPromise=null;return null;}})();
 return nearConnectorPromise;
}

function updateWalletUI(){$('#connectBtn').textContent=connectedAccount?`${connectedAccount.slice(0,7)}…${connectedAccount.slice(-5)}`:'Connect Testnet wallet';$('#walletStatus').textContent=connectedAccount?`Connected NEAR Testnet account: ${connectedAccount}`:'No NEAR wallet connected.';}

$('#connectBtn').addEventListener('click',async()=>{const button=$('#connectBtn');button.disabled=true;button.textContent='Opening wallet options…';try{const connector=await initNearConnect();if(!connector)throw new Error('Wallet connector could not initialize.');await connector.connect()}catch(error){console.error('Testnet wallet connection failed:',error);toast('Wallet connection was cancelled or unavailable.')}finally{button.disabled=false;updateWalletUI();}});

async function versionedIntentsNonce(){const {salt}=await api('/api/near-intents/nonce-salt');return buildVersionedNonce({salt,timestampMs:Date.now()});}
async function signInConfidential(){
 const button=$('#intentsSignInBtn'),status=$('#intentsAuthStatus');
 button.disabled=true;button.textContent='Opening NEAR Mainnet wallet…';status.textContent='Choose a Mainnet wallet in the wallet window.';
 try{
  const Connector=await loadNearConnectorClass();
  intentsAccount=null;
  if(!intentsConnector){intentsConnector=new Connector({network:'mainnet',features:{mainnet:true,signInWithoutAddKey:true,signMessage:true},footerBranding:null});intentsConnector.on('wallet:signIn',({accounts})=>{const account=accounts?.[0]?.accountId;if(account){intentsAccount=account;status.textContent=`Wallet connected: ${account}. Preparing secure sign-in…`;$('#intentsSignInBtn').textContent='Preparing secure sign-in…';}});}
  intentsWallet=await intentsConnector.connect();status.textContent='Wallet selected. Preparing Mainnet account…';$('#intentsSignInBtn').textContent='Preparing secure sign-in…';
  if(!intentsAccount){const accounts=await intentsWallet.getAccounts({network:'mainnet'});intentsAccount=accounts?.[0]?.accountId;}
  if(!intentsAccount)throw new Error('The wallet did not return a NEAR Mainnet account. Please connect it to Mainnet and try again.');
  const destinationChain=$('#destinationAsset').selectedOptions[0]?.dataset.chain||'';
  if(/near/i.test(destinationChain)&&!$('#intentRecipient').value.trim())$('#intentRecipient').value=intentsAccount;
  status.textContent='Account found. Loading NEAR Intents security data…';$('#intentsSignInBtn').textContent='Loading secure sign-in…';
  const deadline=new Date(Date.now()+5*60_000).toISOString(),nonce=await versionedIntentsNonce();
  const message=JSON.stringify({deadline,intents:[],signer_id:intentsAccount});
  status.textContent='Please approve the sign-in message in your wallet. It will not send funds.';$('#intentsSignInBtn').textContent='Approve message in wallet…';
  const signed=await intentsWallet.signMessage({message,recipient:'intents.near',nonce,network:'mainnet',signerId:intentsAccount});
  const signatureBytes=Uint8Array.from(atob(signed.signature),char=>char.charCodeAt(0));
  const signedData={standard:'nep413',payload:{recipient:'intents.near',nonce:btoa(String.fromCharCode(...nonce)),message},public_key:signed.publicKey.startsWith('ed25519:')?signed.publicKey:`ed25519:${signed.publicKey}`,signature:`ed25519:${base58Encode(signatureBytes)}`};
  status.textContent='Wallet signature received. Verifying it with NEAR Intents…';$('#intentsSignInBtn').textContent='Verifying wallet signature…';
  const auth=await api('/api/near-intents/authenticate',{method:'POST',body:JSON.stringify({signedData})});
  if(!auth.accessToken)throw new Error('NEAR Intents did not return an access token.');
  confidentialAccessToken=auth.accessToken;confidentialRefreshToken=auth.refreshToken||null;confidentialTokenExpiresAt=Date.now()+Number(auth.expiresIn||900)*1000-30_000;
  status.textContent=`Confidential swaps enabled for ${intentsAccount} (Mainnet).`;button.textContent='NEAR Mainnet wallet connected ✓';toast('Wallet signed in for confidential swaps. No funds moved.');
 }catch(error){
  console.error('Confidential wallet sign-in failed:',error);let message=error.message;
  if(error.status===404)message='The API server is outdated. In its Terminal press Ctrl+C, run “npm run server” again, then reload this page.';
  else if(error.status===401||error.status===403||/signature verification failed|public key.*(register|authori)|not registered/i.test(message)){
   status.innerHTML='NEAR Intents rejected this signature. Check that the wallet signed with the selected Mainnet account and current key. For a named NEAR account, its public key may need one-time registration with <code>add_public_key</code> on <code>intents.near</code>. <a href="https://docs.near-intents.org/integration/verifier-contract/account-abstraction" target="_blank" rel="noopener noreferrer">Open NEAR’s instructions ↗</a> This registration requires a separate wallet confirmation.';
   button.textContent='Connect NEAR Mainnet wallet';return;
  }
  status.textContent=`Could not sign in: ${message}`;button.textContent='Connect NEAR Mainnet wallet';
 }finally{button.disabled=false;}
}
async function getConfidentialAccessToken(){
 if(confidentialAccessToken&&Date.now()<confidentialTokenExpiresAt)return confidentialAccessToken;
 if(confidentialRefreshToken){try{const refreshed=await api('/api/near-intents/refresh',{method:'POST',body:JSON.stringify({refreshToken:confidentialRefreshToken})});if(refreshed.accessToken){confidentialAccessToken=refreshed.accessToken;confidentialTokenExpiresAt=Date.now()+Number(refreshed.expiresIn||900)*1000-30_000;return confidentialAccessToken;}}catch{}}
 confidentialAccessToken=null;confidentialRefreshToken=null;confidentialTokenExpiresAt=0;throw new Error('Your NEAR Intents sign-in expired. Connect your Mainnet wallet again.');
}
$('#intentsSignInBtn').addEventListener('click',signInConfidential);
function syncIntentPrivacyUI(){const needsAuth=$('#intentPrivacy').value!=='public';$('#intentsAuthBox').hidden=!needsAuth;if(needsAuth&&!confidentialAccessToken)$('#intentsAuthStatus').textContent='Connect and approve a message signature with a NEAR Mainnet wallet. No funds move.';}
$('#intentPrivacy').addEventListener('change',syncIntentPrivacyUI);
syncIntentPrivacyUI();

async function openOrganizationEditor(){if(!currentUser)return accountModal('register');try{const {organization:o}=await api('/api/organizations/me');organizationModal();if(o){$('#orgType').value=o.type;$('#orgName').value=o.name;$('#orgCountry').value=o.country;$('#orgWebsite').value=o.website||'';$('#orgCause').value=o.cause;$('#saveOrgBtn').textContent='Update organization ↗';}}catch(e){toast(e.message)}}

$('#modalContent').addEventListener('change',e=>{if(e.target.id==='projectFundingModel')$('#projectGoalField').hidden=e.target.value==='ongoing';});
$('#onchainCampaign').addEventListener('change',e=>{if(e.target.id==='chainCampaignMode')$('#chainCampaignGoalField').hidden=e.target.value==='ongoing';});

$('#registerBtn').addEventListener('click',openOrganizationEditor);$('#orgRegisterBtn').addEventListener('click',openOrganizationEditor);

$('#modalContent').addEventListener('click',async e=>{try{
 if(e.target.id==='authSwitch'){e.preventDefault();accountModal($('#authSubmit')?.textContent.includes('Create')?'login':'register');return;}
 if(e.target.id==='authSubmit'){const mode=e.target.textContent.includes('Create')?'register':'login',email=$('#authEmail').value.trim(),password=$('#authPassword').value;if(!email||!password)return toast('Enter your email and password.');e.target.disabled=true;const {user}=await api(`/api/auth/${mode}`,{method:'POST',body:JSON.stringify({email,password})});currentUser=user;closeModal();await refreshAccount();toast(mode==='register'?'Account created. Now set up your organization.':'Signed in successfully.');if(mode==='register')organizationModal();return;}
 if(e.target.id==='saveOrgBtn'){if(!currentUser){closeModal();return accountModal('register')}const payload={type:$('#orgType').value,name:$('#orgName').value.trim(),country:$('#orgCountry').value.trim(),website:$('#orgWebsite').value.trim(),cause:$('#orgCause').value,wallet:connectedAccount||''};e.target.disabled=true;await api('/api/organizations',{method:'POST',body:JSON.stringify(payload)});closeModal();await refreshAccount();toast('Organization profile saved. It is not yet verified.');return;}
 if(e.target.id==='editOrgBtn'){await openOrganizationEditor();return;}
 if(e.target.id==='logoutBtn'){await api('/api/auth/logout',{method:'POST'});currentUser=null;closeModal();await refreshAccount();toast('Signed out.');return;}
 if(e.target.id==='runProjectAgentBtn'){const title=$('#projectTitle').value.trim(),category=$('#projectCategory').value,fundingModel=$('#projectFundingModel').value,goal=fundingModel==='ongoing'?0:Number($('#projectGoal').value),description=$('#projectDescription').value.trim(),result=$('#projectAgentResult');if(title.length<8||description.length<30||(fundingModel==='targeted'&&(!Number.isFinite(goal)||goal<50)))throw new Error('Complete the title, description and funding details first.');e.target.disabled=true;e.target.textContent='Reviewing with NEAR AI…';result.hidden=false;result.textContent='Sending the proposal details to NEAR AI Cloud for a limited readiness review…';try{const {report,disclaimer,model}=await api('/api/agent/project-readiness',{method:'POST',body:JSON.stringify({title,category,goal,fundingModel,description})});const section=(heading,items)=>items?.length?`<h4>${heading}</h4><ul>${items.map(item=>`<li>${esc(item)}</li>`).join('')}</ul>`:'';result.innerHTML=`<div class="agent-result-head">AI readiness notes <small>${esc(model)}</small></div><p>${esc(report.overview)}</p>${section('Strengths',report.strengths)}${section('Gaps to consider',report.gaps)}${section('Questions for the team',report.questions)}${section('Possible milestones',report.milestoneSuggestions)}<small>${esc(disclaimer)}</small>`;}catch(error){result.textContent=error.message;}finally{e.target.disabled=false;e.target.textContent='Review project readiness with AI';}return;}
 if(e.target.id==='submitProjectBtn'){const title=$('#projectTitle').value.trim(),category=$('#projectCategory').value,fundingModel=$('#projectFundingModel').value,goal=fundingModel==='ongoing'?0:Number($('#projectGoal').value),description=$('#projectDescription').value.trim();if(title.length<8||title.length>120)throw new Error('The title must contain 8–120 characters.');if(description.length<30||description.length>1200)throw new Error('The description must contain at least 30 characters and no more than 1,200.');if(fundingModel==='targeted'&&(!Number.isFinite(goal)||goal<50||goal>10000000))throw new Error('Enter a funding goal from 50 to 10,000,000.');e.target.disabled=true;e.target.textContent='Submitting proposal…';await api('/api/projects',{method:'POST',body:JSON.stringify({title,category,goal,fundingModel,description})});closeModal();await loadMyProjects();toast('Project submitted for review. No blockchain transaction was sent.');return;}
 }catch(err){toast(err.message||'Something went wrong.');if(e.target?.disabled)e.target.disabled=false;if(e.target?.id==='submitProjectBtn')e.target.textContent='Submit for review ↗';}});

async function loadIntentTokens(){
 const from=$('#originAsset'),to=$('#destinationAsset');
 try{
  const data=await api('/api/near-intents/tokens');
  supportedTokens=Array.isArray(data)?data:(data.tokens||data.items||[]);
  const validTokens=supportedTokens.filter(token=>token.assetId&&token.symbol);
  if(!validTokens.length)throw new Error('No supported tokens returned');
  const options=validTokens.map(token=>`<option value="${esc(token.assetId)}" data-decimals="${Number(token.decimals)||0}" data-chain="${esc(token.blockchain||token.chain||'')}">${esc(token.symbol)} · ${esc(token.blockchain||token.chain||'network')}</option>`).join('');
  from.innerHTML=options;to.innerHTML=options;
  const source=validTokens.find(token=>/wnear/i.test(token.symbol||'')&&/near/i.test(token.blockchain||token.chain||''))||validTokens[0];
  from.value=source.assetId;
  const sourceChain=from.selectedOptions[0]?.dataset.chain||'';
  const destination=validTokens.find(token=>token.assetId!==source.assetId&&(token.blockchain||token.chain||'')!==sourceChain&&/usdc/i.test(token.symbol||''))
   ||validTokens.find(token=>token.assetId!==source.assetId&&(token.blockchain||token.chain||'')!==sourceChain)
   ||validTokens.find(token=>token.assetId!==source.assetId&&/usdc/i.test(token.symbol||''))
   ||validTokens.find(token=>token.assetId!==source.assetId);
  if(destination)to.value=destination.assetId;
  syncIntentsAmountLabel();
  syncIntentsAddressLabels();
  from.addEventListener('change',syncIntentsAmountLabel);
  from.addEventListener('change',syncIntentsAddressLabels);
  to.addEventListener('change',()=>{
   syncIntentsAddressLabels();
   const destinationChain=to.selectedOptions[0]?.dataset.chain||'';
   if(/near/i.test(destinationChain)&&intentsAccount&&!$('#intentRecipient').value.trim())$('#intentRecipient').value=intentsAccount;
  });
  $('#tokenStatus').textContent=`${validTokens.length} live supported assets loaded from NEAR Intents.`;
 }catch(error){
  console.warn(error);
  from.innerHTML='<option value="">Token list unavailable</option>';
  to.innerHTML='<option value="">Token list unavailable</option>';
  $('#tokenStatus').textContent='Could not load live assets. Start the API server and check network access.';
 }
}
function escrowCampaignCreator(){
 return `<section class="review-card campaign-creator" aria-labelledby="chainCampaignHeading"><div class="eyebrow">NEAR TESTNET · WALLET CONFIRMATION REQUIRED</div><h3 id="chainCampaignHeading">Create a testnet campaign</h3><p>This creates an on-chain campaign with the connected account as fixed recipient. New campaigns stay inactive until the contract reviewer approves them.</p><label for="chainCampaignTitle">CAMPAIGN TITLE</label><input id="chainCampaignTitle" maxlength="120" placeholder="At least 8 characters"><label for="chainCampaignDescription">DESCRIPTION</label><textarea id="chainCampaignDescription" rows="3" maxlength="2000" placeholder="At least 30 characters"></textarea><label for="chainCampaignMode">FUNDING MODEL</label><select id="chainCampaignMode"><option value="targeted">Campaign with a funding target</option><option value="ongoing">Ongoing fund · no target</option></select><div id="chainCampaignGoalField"><label for="chainCampaignGoal">FUNDING GOAL (NEAR)</label><input id="chainCampaignGoal" type="text" inputmode="decimal" value="1"></div><label for="chainCampaignHold">HOLD DONATIONS UNTIL</label><input id="chainCampaignHold" type="date" value="${isoDay(Date.now()+DAY_MS*90)}" min="${isoDay(Date.now()+DAY_MS*2)}" max="${isoDay(Date.now()+DAY_MS*365*3)}"><small>Donations close on this date and staked funds must be back in escrow before it. It cannot be extended.</small><button class="btn btn-primary" id="createChainCampaignBtn" type="button">Create on NEAR Testnet ↗</button><div id="chainCampaignCreateStatus" aria-live="polite"></div><small>Ongoing funds have no fundraising cap. Donations can continue after the staking threshold is met and while funds are staked. Staking uses a reviewer-maintained NEAR equivalent of $1,000; it is not a live USD price.</small></section>`;
}

const DAY_MS=86400000,STAKE_EXIT_BUFFER_MS=3*DAY_MS;
const holdUntil=c=>Number(c.hold_until_ms||0);
const fmtDate=ms=>new Date(ms).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
const isoDay=ms=>{const d=new Date(ms);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
// End of the selected local day, as Unix ms.
const dayToHoldMs=value=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))throw new Error('Choose the date until which donations may be held.');const [y,m,d]=value.split('-').map(Number);return new Date(y,m-1,d,23,59,59).getTime();};
const exitWindowOpen=c=>holdUntil(c)>0&&Date.now()+STAKE_EXIT_BUFFER_MS>=holdUntil(c);

function holdDateBlock(id,campaign){
 const hold=holdUntil(campaign),owner=!!connectedAccount&&connectedAccount===campaign.owner;
 if(!hold){
  if(!owner)return '<p class="hold-line">No hold date set yet · staking stays disabled until the owner sets one.</p>';
  return `<div class="milestone-form"><div class="eyebrow">SET A HOLD DATE · ONE TIME</div><p class="ms-hint">Donations can be collected and held until this date. It cannot be changed later. Staking is only possible while at least 3 days remain.</p><label for="holdDate-${id}">HOLD DONATIONS UNTIL</label><input id="holdDate-${id}" class="milestoneInput" type="date" min="${isoDay(Date.now()+DAY_MS*2)}" max="${isoDay(Date.now()+DAY_MS*365*3)}"><button class="btn btn-outline setHoldDateBtn" type="button" data-campaign-id="${id}">Set hold date on-chain ↗</button><div id="holdStatus-${id}" class="ms-status" aria-live="polite"></div></div>`;
 }
 const ended=Date.now()>=hold;
 return `<p class="hold-line ${ended?'hold-ended':''}">${ended?`Donation period ended on <b>${fmtDate(hold)}</b>.`:`Collecting and holding donations until <b>${fmtDate(hold)}</b>.`}</p>`;
}

function campaignReviewAction(id,campaign){
 if(campaign.active&&holdUntil(campaign)&&Date.now()>=holdUntil(campaign))return `<p>The donation period ended on ${fmtDate(holdUntil(campaign))}. Escrowed funds can still be released through approved milestones.</p>`;
 if(campaign.active)return `<label for="donationAmount-${id}">DONATION AMOUNT (NEAR)</label><input id="donationAmount-${id}" class="donationAmountInput" type="text" inputmode="decimal" maxlength="15" value="0.01" aria-label="Donation amount in NEAR"><small>Minimum 0.01 NEAR · Maximum 10,000 NEAR · Up to 10 decimal places. Testnet only.</small><button class="btn btn-primary donateOnchainBtn" data-campaign-id="${id}">Donate 0.01 NEAR</button><div id="donationStatus-${id}" aria-live="polite"></div>`;
 if(connectedAccount&&connectedAccount===contractAdmin)return `<p>This campaign is awaiting review. Connected account is the contract reviewer.</p><button class="btn btn-primary approveCampaignBtn" data-campaign-id="${id}">Approve campaign on Testnet ↗</button><div id="approvalStatus-${id}" aria-live="polite"></div>`;
 return '<p>This campaign is inactive and cannot receive donations until the designated contract reviewer approves it.</p>';
}

function campaignStakingAction(id,campaign,staking,near){
 const openEnded=BigInt(campaign.goal||'0')===0n;
 const threshold=BigInt(staking?.minimum_open_fund_stake||'0');
 const funded=openEnded?threshold>0n&&BigInt(campaign.remaining_escrow||'0')>=threshold:BigInt(campaign.raised||'0')>=BigInt(campaign.goal||'0');
 const owner=connectedAccount&&connectedAccount===campaign.owner;
 const current=staking?.active_campaign_id===id;
 const status=current?staking.status:'idle';
 const details=`<p>Approved validator pool: ${esc(staking?.pool_id||'not configured')}</p><p>Staked principal: ${near(campaign.staked_escrow||'0')} NEAR · rewards returned to campaign: ${near(campaign.staking_rewards||'0')} NEAR</p>`;
 const maxStake=BigInt(campaign.remaining_escrow||'0');
 const tenthNear=100000000000000000000000n;
 const defaultRaw=maxStake<tenthNear?maxStake:tenthNear;
 const defaultStakeAmount=(()=>{const whole=defaultRaw/1000000000000000000000000n;const fraction=(defaultRaw%1000000000000000000000000n).toString().padStart(24,'0').replace(/0+$/,'');return fraction?`${whole}.${fraction}`:String(whole);})();
 if(!staking)return `<p>Staking status is temporarily unavailable. The contract state could not be read; reload or check the Testnet API before starting a staking action.</p>`;
 const hold=holdUntil(campaign),exitOpen=exitWindowOpen(campaign);
 const exitNote=hold?`<p class="ms-hint">Staking must end before the hold date (${fmtDate(hold)}). From ${fmtDate(hold-STAKE_EXIT_BUFFER_MS)} anyone can start the unstake so funds are back in escrow in time.</p>`:'';
 if(current&&status==='staked')return `${details}${exitNote}${owner||exitOpen?`<button class="btn btn-outline campaignUnstakeBtn" data-campaign-id="${id}">${exitOpen&&!owner?'Exit window open · start unstaking':'Start unstaking for project use'}</button><div id="stakeStatus-${id}" aria-live="polite"></div>`:'<p>This campaign has an active staking position.</p>'}`;
 if(current&&status==='unstaking')return `${details}<p>Unstaking is in progress. The contract will record the unlock epoch when the pool confirms it.</p>`;
 if(current&&status==='unstaked'){
  const ready=Number(staking.current_epoch)>=Number(staking.unstake_epoch)+Number(staking.required_unstake_epochs);
  return `${details}<p>${ready?'The standard pool unlock delay has elapsed.':'Withdrawal is time-locked until the pool unlock delay has elapsed.'} Unlock epoch ${Number(staking.unstake_epoch)+Number(staking.required_unstake_epochs)} · current epoch ${staking.current_epoch}.</p>${owner||exitWindowOpen(campaign)?`<button class="btn btn-primary campaignWithdrawBtn" data-campaign-id="${id}" ${ready?'':'disabled'}>Withdraw stake back to campaign</button><div id="stakeStatus-${id}" aria-live="polite"></div>`:''}`;
 }
 if(current&&['checking_withdraw','withdrawing','staking'].includes(status))return `${details}<p>Staking transaction status: ${esc(status.replaceAll('_',' '))}. Refresh shortly to see the confirmed result.</p>`;
 if(!funded)return openEnded?`<p>This ongoing fund has no fundraising target and can keep receiving donations. Staking unlocks once remaining escrow reaches the reviewer-set threshold: ${threshold>0n?`${near(threshold)} NEAR (the manual $1,000 equivalent).`:'not configured yet.'} No live USD price is used.</p>`:'<p>Staking unlocks only after donations have reached the full campaign goal.</p>';
 if(!hold)return '<p>Staking requires a campaign hold date, so funds are never staked indefinitely.</p>';
 if(Date.now()+STAKE_EXIT_BUFFER_MS>hold)return `<p>Staking is closed: less than 3 days remain before the hold date (${fmtDate(hold)}), which is the time needed to unstake and withdraw.</p>`;
 if(!staking.pool_id)return '<p>The contract reviewer has not configured the approved Testnet staking pool yet.</p>';
 if(staking.active_campaign_id!==null&&staking.active_campaign_id!==undefined)return '<p>Another campaign currently uses the contract staking position. Its owner must finish unstaking and withdrawal first.</p>';
 if(!owner)return `<p>${openEnded?'Once the ongoing fund reaches its staking threshold,':'Once fully funded,'} only this campaign’s connected owner can opt in to staking or request an unstake.</p>`;
 if(maxStake===0n)return `${details}<p>No unallocated campaign escrow is available to stake.</p>`;
 return `${details}${openEnded?`<p>Threshold met (${near(threshold)} NEAR reference). The fund remains open for new donations while this position is active.</p>`:''}<label for="stakeAmount-${id}">AMOUNT TO STAKE (NEAR)</label><input id="stakeAmount-${id}" class="stakeAmountInput" type="text" inputmode="decimal" value="${defaultStakeAmount}" aria-label="Amount of campaign escrow to stake in NEAR"><small>Optional · up to ${near(campaign.remaining_escrow)} NEAR available. Staking is not guaranteed to earn rewards; unstaking can take at least four epochs.</small>${exitNote}<button class="btn btn-primary campaignStakeBtn" data-campaign-id="${id}">Stake campaign escrow ↗</button><div id="stakeStatus-${id}" aria-live="polite"></div>`;
}

function stakingAdminPanel(staking){
 if(!staking||connectedAccount!==contractAdmin)return '';
 const minimum=BigInt(staking.minimum_open_fund_stake||'0');
 const currentNear=minimum===0n?'':`${minimum/10n**24n}.${(minimum%10n**24n).toString().padStart(24,'0').replace(/0+$/,'')||'0'}`;
 return `<section class="review-card" style="margin:18px 0"><div class="eyebrow">REVIEWER CONFIGURATION · TESTNET</div><h3>Ongoing fund staking settings</h3><p>This contract has no live USD price feed. Set the NEAR amount you currently treat as the $1,000 reference threshold; update it manually when the exchange rate changes. The on-chain rule checks the remaining NEAR escrow.</p>${staking.pool_id?`<p>Approved staking pool: <strong>${esc(staking.pool_id)}</strong></p>`:`<h4>Choose the approved staking pool</h4><p>Only configure a validator pool account you have independently checked. Unstaking may be time-locked.</p><label for="stakingPoolAccount">VALIDATOR POOL ACCOUNT</label><input id="stakingPoolAccount" maxlength="64" placeholder="validator-pool.testnet"><button class="btn btn-outline" id="configureStakingPoolBtn" type="button">Configure pool in reviewer wallet ↗</button><div id="stakingPoolStatus" aria-live="polite"></div>`}<label for="openFundThresholdNear">$1,000 REFERENCE IN NEAR</label><input id="openFundThresholdNear" type="text" inputmode="decimal" value="${currentNear}" placeholder="Enter current NEAR equivalent"><button class="btn btn-outline" id="configureOpenFundThresholdBtn" type="button">Save threshold in reviewer wallet ↗</button><p>Current on-chain threshold: ${minimum>0n?`${currentNear} NEAR`:'not configured'}. This is an admin-maintained reference, not a guaranteed current dollar value.</p><div id="openFundThresholdStatus" aria-live="polite"></div></section>`;
}

const MILESTONE_LABELS={proposed:'Awaiting evidence',submitted:'Evidence submitted · awaiting review',paying:'Payout in progress',paid:'Paid to recipient'};
const shortUrl=u=>{try{const x=new URL(u);const t=(x.host+x.pathname).replace(/\/$/,'');return t.length>48?`${t.slice(0,45)}…`:t;}catch{return 'evidence link';}};
const liquidEscrow=c=>{const v=BigInt(c.remaining_escrow||'0')-BigInt(c.staked_escrow||'0');return v>0n?v:0n;};

function milestoneBlock(cid,i,m,campaign,near){
 const owner=!!connectedAccount&&connectedAccount===campaign.owner;
 const reviewer=!!connectedAccount&&connectedAccount===contractAdmin;
 const uri=/^https:\/\//i.test(m.evidence_uri||'')?m.evidence_uri:null;
 const evidence=uri?`<p class="ms-evidence">Evidence: <a href="${esc(uri)}" target="_blank" rel="noopener noreferrer nofollow">${esc(shortUrl(uri))} ↗</a></p>`:'';
 let action='';
 if(m.status==='proposed'&&owner&&campaign.active)action=`<label for="evidence-${cid}-${i}">EVIDENCE LINK (HTTPS)</label><input id="evidence-${cid}-${i}" class="milestoneInput" type="url" maxlength="500" placeholder="https://… photo report, receipt or public update"><button class="btn btn-outline submitEvidenceBtn" type="button" data-campaign-id="${cid}" data-milestone-id="${i}">Submit evidence on-chain ↗</button>`;
 else if(m.status==='proposed')action='<small class="ms-hint">Waiting for the project to submit evidence.</small>';
 else if(m.status==='submitted'&&reviewer)action=`<button class="btn btn-primary releaseMilestoneBtn" type="button" data-campaign-id="${cid}" data-milestone-id="${i}">Approve &amp; release ${near(m.amount)} NEAR ↗</button>`;
 else if(m.status==='submitted')action='<small class="ms-hint">Waiting for the contract reviewer to check the evidence and release the payout.</small>';
 return `<div class="milestone ms-${esc(m.status)}"><div class="ms-head"><strong>Milestone ${i+1}: ${esc(m.title)}</strong><span class="ms-badge">${esc(MILESTONE_LABELS[m.status]||m.status)}</span></div><p class="ms-amount">${near(m.amount)} NEAR → ${esc(campaign.recipient||campaign.owner)}</p>${evidence}${action}<div id="milestoneStatus-${cid}-${i}" class="ms-status" aria-live="polite"></div></div>`;
}

function milestoneProposeForm(cid,campaign,near){
 if(!connectedAccount||connectedAccount!==campaign.owner||!campaign.active)return '';
 const liquid=liquidEscrow(campaign);
 if(liquid===0n)return '<p class="ms-hint">You can propose a milestone once donations are held in escrow.</p>';
 return `<div class="milestone-form"><div class="eyebrow">YOU OWN THIS CAMPAIGN · PROPOSE A MILESTONE</div><label for="msTitle-${cid}">MILESTONE TITLE</label><input id="msTitle-${cid}" class="milestoneInput" maxlength="120" placeholder="e.g. Buy veterinary supplies for 10 dogs"><label for="msAmount-${cid}">PAYOUT AMOUNT (NEAR)</label><input id="msAmount-${cid}" class="milestoneInput" type="text" inputmode="decimal" placeholder="Up to ${near(liquid)} NEAR"><button class="btn btn-outline proposeMilestoneBtn" type="button" data-campaign-id="${cid}">Propose milestone on-chain ↗</button><div id="msProposeStatus-${cid}" class="ms-status" aria-live="polite"></div></div>`;
}

async function afterEscrowTx(statusId,message,result){
 const hash=result?.transaction?.hash;
 await loadOnchainCampaign();
 const show=()=>{const el=document.getElementById(statusId);if(el)el.innerHTML=`${esc(message)}${txLink(hash)}`;};
 show();toast(message);
 // Finalized RPC data can lag a few seconds behind the wallet result; refresh once more.
 setTimeout(async()=>{await loadOnchainCampaign();show();},6000);
}

const ACTIVITY_LABELS={donate:['Donation received','✳'],create_campaign:['Campaign created','＋'],approve_campaign:['Campaign approved by reviewer','✓'],propose_milestone:['Milestone proposed','◇'],submit_milestone_evidence:['Evidence submitted','✎'],approve_and_release:['Milestone payout released','↗'],stake_campaign_escrow:['Escrow staked','◎'],unstake_campaign_escrow:['Unstake started','◎'],withdraw_campaign_escrow:['Stake withdrawn to campaign','◎'],set_staking_pool:['Staking pool configured','⚙'],set_open_fund_stake_threshold:['Staking threshold updated','⚙'],set_campaign_hold_until:['Hold date set','◷'],migrate_v3:['Contract state migrated','⚙'],migrate:['Contract state migrated','⚙'],migrate_v2:['Contract state migrated','⚙'],DEPLOY_CONTRACT:['Contract code deployed','⚙'],new:['Contract initialized','⚙'],CREATE_ACCOUNT:['Contract account created','⚙']};
const timeAgo=ms=>{const d=Math.max(0,Date.now()-ms),m=Math.round(d/60000);if(m<60)return `${m||1} min ago`;const h=Math.round(m/60);if(h<48)return `${h} h ago`;return new Date(ms).toLocaleDateString('en-GB',{day:'numeric',month:'short'});};
async function loadLiveLedger(){
 const box=$('#liveLedger');if(!box)return;
 try{
  const {items=[],contractId}=await api('/api/escrow/activity');
  const ADMIN=['DEPLOY_CONTRACT','CREATE_ACCOUNT','migrate','migrate_v2','migrate_v3','new','set_staking_pool','set_open_fund_stake_threshold'];const funding=items.filter(t=>t.ok&&!ADMIN.includes(t.method));const rows=funding.slice(0,5);for(const key of ['approve_and_release','submit_milestone_evidence']){const hit=funding.find(t=>t.method===key);if(hit&&!rows.includes(hit))rows.push(hit);}rows.sort((a,b)=>b.time-a.time);
  if(!rows.length)return;
  const fmt=y=>{const v=Number(BigInt(y)*10000n/10n**24n)/10000;return v.toLocaleString('en-US',{maximumFractionDigits:4});};
  const flows=items.filter(t=>t.ok&&t.method==='donate').length,payouts=items.filter(t=>t.ok&&t.method==='approve_and_release').length;
  box.innerHTML=`<div class="ledger-head"><div><small>LIVE ON-CHAIN LEDGER</small><strong>Latest escrow activity</strong></div><span class="ledger-live"><i></i>NEAR TESTNET</span></div>${rows.map(t=>{const [label,icon]=ACTIVITY_LABELS[t.method]||[t.method.replaceAll('_',' '),'•'];const amount=t.method==='donate'&&t.deposit!=='0'?`<b>+${fmt(t.deposit)} NEAR</b>`:'<b class="ledger-tx">tx ↗</b>';return `<a class="ledger-row" href="https://testnet.nearblocks.io/txns/${encodeURIComponent(t.hash)}" target="_blank" rel="noopener noreferrer"><span class="ledger-icon">${icon}</span><div><strong>${esc(label)}</strong><small>${esc(t.signer)} · ${esc(timeAgo(t.time))}</small></div>${amount}</a>`;}).join('')}<div class="ledger-foot"><span>${flows} DONATIONS · ${payouts} PAYOUT${payouts===1?'':'S'} IN RECENT HISTORY</span><a href="https://testnet.nearblocks.io/address/${encodeURIComponent(contractId||escrowContractId)}" target="_blank" rel="noopener noreferrer"><strong>ALL TRANSACTIONS ↗</strong></a></div>`;
  const copy=$('#ledgerCopy');if(copy)copy.textContent='Every donation, evidence submission and payout is a public transaction. The ledger shows the latest activity of the ImpactFlow escrow contract, read live from NEAR Testnet; each row links to the transaction.';
 }catch(error){console.warn('Live ledger unavailable; showing sample ledger.',error);}
}

async function sendEscrowCall(methodName,args){
 if(!connectedAccount||!nearConnector)throw new Error('Connect the NEAR Testnet wallet first.');
 const wallet=await nearConnector.wallet();
 return wallet.signAndSendTransaction({receiverId:escrowContractId,actions:[{type:'FunctionCall',params:{methodName,args,gas:'150000000000000',deposit:'0'}}]});
}

async function loadOnchainCampaign(){
 const box=$('#onchainCampaign');if(!box)return;
 try{
  const [{count,network},{admin,contractId},stakingData]=await Promise.all([api('/api/escrow/count'),api('/api/escrow/admin'),api('/api/escrow/staking').catch(()=>null)]);
  const staking=stakingData?.staking||null;
  contractAdmin=admin;escrowContractId=contractId||escrowContractId;
  const ids=Array.from({length:Math.min(Number(count)||0,100)},(_,i)=>i);
  const results=await Promise.all(ids.map(async id=>{const data=await api(`/api/escrow/campaign/${id}`);return {id,campaign:data.campaign};}));
  const near=value=>(Number(value||0)/1e24).toLocaleString('en-US',{maximumFractionDigits:4});
  box.style.padding='0 24px';
  const creator=escrowCampaignCreator();
  if(!results.length){box.innerHTML=`${creator}${stakingAdminPanel(staking)}<div class="eyebrow">LIVE ON NEAR ${esc(network.toUpperCase())}</div><h3>No on-chain campaigns yet</h3><p>Create a Testnet campaign above. The local project submission form only queues proposals for review.</p>`;return;}
  box.innerHTML=`${creator}${stakingAdminPanel(staking)}<div class="eyebrow">${results.length} CAMPAIGN${results.length===1?'':'S'} · LIVE ON NEAR ${esc(network.toUpperCase())}</div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:20px;margin-top:16px">${results.map(({id,campaign})=>{const openEnded=BigInt(campaign.goal||'0')===0n,threshold=BigInt(staking?.minimum_open_fund_stake||'0'),progress=openEnded?(threshold>0n?Math.min(100,Number(BigInt(campaign.remaining_escrow||'0')*100n/threshold)):0):Math.min(100,Number(campaign.raised)/Number(campaign.goal)*100);const milestones=(campaign.milestones||[]).map((m,i)=>milestoneBlock(id,i,m,campaign,near)).join('');const role=connectedAccount&&connectedAccount===contractAdmin?'<span class="role-pill">You are the contract reviewer</span>':connectedAccount&&connectedAccount===campaign.owner?'<span class="role-pill">You own this campaign</span>':'';return `<article style="padding:22px;border:1px solid var(--line,#444);border-radius:14px;min-width:0"><div class="eyebrow">ON-CHAIN CAMPAIGN #${id}</div>${role}<h3 style="font-size:24px;margin:12px 0">${esc(campaign.title)}</h3><p style="white-space:pre-wrap">${esc(campaign.description)}</p><p>Recipient: ${esc(campaign.recipient||campaign.owner)}</p><div style="margin:22px 0"><div style="display:flex;justify-content:space-between;gap:12px"><strong>${near(campaign.raised)} NEAR raised</strong><span>${openEnded?'ONGOING FUND · NO TARGET':`${near(campaign.goal)} NEAR goal`}</span></div><div style="height:8px;background:var(--line,#333);border-radius:8px;margin-top:12px;overflow:hidden"><div style="height:100%;width:${progress}%;background:#65d6a2;border-radius:8px"></div></div><p>${openEnded?(threshold>0n?`${near(campaign.remaining_escrow)} / ${near(threshold)} NEAR staking threshold · keeps accepting donations`:'Ongoing fund · staking threshold not configured'):`${progress>0&&progress<0.1?"&lt;0.1":progress.toFixed(1)}% funded`}</p></div><p>Remaining escrow: ${near(campaign.remaining_escrow)} NEAR</p><p>Campaign status: ${campaign.active?'Active':'Awaiting reviewer approval'}</p>${holdDateBlock(id,campaign)}<h4 style="margin-top:24px">Milestones &amp; proof</h4><p class="ms-flow">Funds leave escrow only after <b>①</b> the project proposes a milestone, <b>②</b> submits public evidence and <b>③</b> the reviewer approves the release.</p>${milestones||'<p>No milestones yet.</p>'}${milestoneProposeForm(id,campaign,near)}<div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--line,#444)"><h4>Optional NEAR staking</h4>${campaignStakingAction(id,campaign,staking,near)}</div><div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--line,#444)"><h4>${campaign.active?'Support this campaign':'Campaign review'}</h4>${campaignReviewAction(id,campaign)}</div></article>`;}).join('')}</div><p style="margin-top:20px;font-size:12px;opacity:.7">Testnet demonstration only. Staking is opt-in, carries pool and smart-contract risk, and may lock funds while unstaking. Milestone status reflects contract data. Evidence links are provided by the project and checked by the reviewer; the contract does not independently verify real-world impact. Open-fund thresholds are reviewer-maintained NEAR references, not live USD prices.</p><a href="https://testnet.nearblocks.io/address/${encodeURIComponent(esc(escrowContractId))}" target="_blank" rel="noopener noreferrer">View smart contract on NEAR Explorer ↗</a>`;
 }catch(error){box.innerHTML='<h3>Testnet escrow is temporarily unavailable</h3><p>ImpactFlow could not read the deployed Testnet contract right now. Check the API and network connection, then retry. Local project proposals and NEAR Intents routes are separate from this Testnet escrow.</p>';console.error('Could not load on-chain campaigns:',error);}
}

$('#onchainCampaign').addEventListener('click',async e=>{
 const setHold=e.target.closest('.setHoldDateBtn');
 if(setHold){
  const id=Number(setHold.dataset.campaignId),status=$(`#holdStatus-${id}`);
  let hold_until_ms;
  try{hold_until_ms=dayToHoldMs($(`#holdDate-${id}`).value);if(hold_until_ms<Date.now()+DAY_MS)throw new Error('The hold date must be at least one day in the future.');}
  catch(error){status.textContent=error.message;return;}
  setHold.disabled=true;setHold.textContent='Confirm in wallet…';
  try{const result=await sendEscrowCall('set_campaign_hold_until',{campaign_id:id,hold_until_ms});await afterEscrowTx(`holdStatus-${id}`,'Hold date saved on Testnet.',result);}
  catch(error){status.textContent=`Hold date was not saved: ${error.message}`;setHold.disabled=false;setHold.textContent='Set hold date on-chain ↗';}
  return;
 }
 const propose=e.target.closest('.proposeMilestoneBtn');
 if(propose){
  const id=Number(propose.dataset.campaignId),status=$(`#msProposeStatus-${id}`);
  const title=$(`#msTitle-${id}`).value.trim();
  let amount;
  try{
   if(title.length<5||title.length>120)throw new Error('Use a milestone title from 5 to 120 characters.');
   const rawAmount=$(`#msAmount-${id}`).value.trim();
   if(/^0*(\.0*)?$/.test(rawAmount))throw new Error('Enter a payout amount above zero.');
   amount=nearToYocto(rawAmount);
  }catch(error){status.textContent=error.message;return;}
  propose.disabled=true;propose.textContent='Confirm in wallet…';
  try{const result=await sendEscrowCall('propose_milestone',{campaign_id:id,title,amount});await afterEscrowTx(`msProposeStatus-${id}`,'Milestone proposed on Testnet.',result);}
  catch(error){status.textContent=`Milestone was not proposed: ${error.message}`;propose.disabled=false;propose.textContent='Propose milestone on-chain ↗';}
  return;
 }
 const evidenceBtn=e.target.closest('.submitEvidenceBtn');
 if(evidenceBtn){
  const id=Number(evidenceBtn.dataset.campaignId),mid=Number(evidenceBtn.dataset.milestoneId),status=$(`#milestoneStatus-${id}-${mid}`);
  const uri=$(`#evidence-${id}-${mid}`).value.trim();
  if(!/^https:\/\/[^\s]+\.[^\s]+/i.test(uri)||uri.length>500){status.textContent='Enter a public HTTPS link (up to 500 characters).';return;}
  evidenceBtn.disabled=true;evidenceBtn.textContent='Confirm in wallet…';
  try{const result=await sendEscrowCall('submit_milestone_evidence',{campaign_id:id,milestone_id:mid,evidence_uri:uri});await afterEscrowTx(`milestoneStatus-${id}-${mid}`,'Evidence submitted on Testnet. The reviewer can now release the payout.',result);}
  catch(error){status.textContent=`Evidence was not submitted: ${error.message}`;evidenceBtn.disabled=false;evidenceBtn.textContent='Submit evidence on-chain ↗';}
  return;
 }
 const release=e.target.closest('.releaseMilestoneBtn');
 if(release){
  const id=Number(release.dataset.campaignId),mid=Number(release.dataset.milestoneId),status=$(`#milestoneStatus-${id}-${mid}`);
  const label=release.textContent;release.disabled=true;release.textContent='Confirm in reviewer wallet…';
  try{const result=await sendEscrowCall('approve_and_release',{campaign_id:id,milestone_id:mid});await afterEscrowTx(`milestoneStatus-${id}-${mid}`,'Payout approved and released from escrow.',result);}
  catch(error){status.textContent=`Payout was not released: ${error.message}`;release.disabled=false;release.textContent=label;}
  return;
 }
 const configurePool=e.target.closest('#configureStakingPoolBtn');
 if(configurePool){
  const poolId=$('#stakingPoolAccount').value.trim(),status=$('#stakingPoolStatus');
  if(!poolId){status.textContent='Enter the approved validator pool account first.';return;}
  configurePool.disabled=true;configurePool.textContent='Confirm in reviewer wallet…';
  try{
   const result=await sendEscrowCall('set_staking_pool',{pool_id:poolId});
   await loadOnchainCampaign();
   const current=$('#stakingPoolStatus');if(current)current.textContent=`Pool configuration submitted${result?.transaction?.hash?`: ${result.transaction.hash}`:''}. Confirm the transaction before asking a campaign owner to stake.`;
  }catch(error){
   status.textContent=`Pool configuration failed or was cancelled: ${error.message}`;
   configurePool.disabled=false;configurePool.textContent='Try configuring the pool again';
  }
  return;
 }
 const configureThreshold=e.target.closest('#configureOpenFundThresholdBtn');
 if(configureThreshold){
  const status=$('#openFundThresholdStatus');configureThreshold.disabled=true;configureThreshold.textContent='Confirm in reviewer wallet…';
  try{const amount=nearToYocto($('#openFundThresholdNear').value);const result=await sendEscrowCall('set_open_fund_stake_threshold',{amount});await loadOnchainCampaign();const current=$('#openFundThresholdStatus');if(current)current.textContent=`Threshold update submitted${result?.transaction?.hash?`: ${result.transaction.hash}`:''}. Confirm the reviewer transaction.`;}
  catch(error){status.textContent=`Threshold update failed or was cancelled: ${error.message}`;configureThreshold.disabled=false;configureThreshold.textContent='Try saving the threshold again';}
  return;
 }
 const stake=e.target.closest('.campaignStakeBtn');
 const unstake=e.target.closest('.campaignUnstakeBtn');
 const withdraw=e.target.closest('.campaignWithdrawBtn');
 const action=stake||unstake||withdraw;
 if(action){
  const id=Number(action.dataset.campaignId);action.disabled=true;
  action.textContent=stake?'Confirm stake in wallet…':unstake?'Confirm unstake in wallet…':'Confirm withdrawal in wallet…';
  try{
   let result;
   if(stake){const amount=nearToYocto($(`#stakeAmount-${id}`).value);result=await sendEscrowCall('stake_campaign_escrow',{campaign_id:id,amount});}
   else if(unstake)result=await sendEscrowCall('unstake_campaign_escrow',{campaign_id:id});
   else result=await sendEscrowCall('withdraw_campaign_escrow',{campaign_id:id});
   const hash=result?.transaction?.hash;
   await loadOnchainCampaign();
   const status=$(`#stakeStatus-${id}`);if(status)status.textContent=`${stake?'Stake':unstake?'Unstake':'Withdrawal'} transaction submitted${hash?`: ${hash}`:''}. Wait for Testnet confirmation, then refresh the campaign status.`;
  }catch(error){
   const status=$(`#stakeStatus-${id}`);if(status)status.textContent=`Staking action failed or was cancelled: ${error.message}`;
   action.disabled=false;action.textContent=stake?'Stake campaign escrow ↗':unstake?'Start unstaking for project use':'Withdraw stake back to campaign';
  }
  return;
 }
 const create=e.target.closest('#createChainCampaignBtn');
 if(create){
  const status=$('#chainCampaignCreateStatus');create.disabled=true;create.textContent='Waiting for wallet confirmation…';
  try{
   const title=$('#chainCampaignTitle').value.trim(),description=$('#chainCampaignDescription').value.trim();
   if(title.length<8||title.length>120)throw new Error('Use a title from 8 to 120 characters.');
   if(description.length<30||description.length>2000)throw new Error('Use a description from 30 to 2,000 characters.');
   const goal=$('#chainCampaignMode').value==='ongoing'?'0':nearToYocto($('#chainCampaignGoal').value);
   const hold_until_ms=dayToHoldMs($('#chainCampaignHold').value);
   if(hold_until_ms<Date.now()+DAY_MS)throw new Error('The hold date must be at least one day in the future.');
   const result=await sendEscrowCall('create_campaign',{title,description,goal,hold_until_ms});
   status.innerHTML=`Campaign transaction submitted. Waiting for contract data…${txLink(result?.transaction?.hash)}`;
   await loadOnchainCampaign();
  }catch(error){status.textContent=`Campaign was not created: ${error.message}`;create.disabled=false;create.textContent='Try campaign creation again';}
  return;
 }
 const approve=e.target.closest('.approveCampaignBtn');
 if(approve){
  const id=Number(approve.dataset.campaignId),status=$(`#approvalStatus-${id}`);approve.disabled=true;approve.textContent='Waiting for reviewer confirmation…';
  try{const result=await sendEscrowCall('approve_campaign',{campaign_id:id});status.innerHTML=`Approval transaction submitted.${txLink(result?.transaction?.hash)}`;await loadOnchainCampaign();}
  catch(error){status.textContent=`Approval failed or was cancelled: ${error.message}`;approve.disabled=false;approve.textContent='Try approval again';}
 }
});

$('#onchainCampaign').addEventListener('input',e=>{
 const input=e.target.closest('.donationAmountInput');if(!input)return;
 const id=input.id.replace('donationAmount-','');
 const btn=$(`#onchainCampaign .donateOnchainBtn[data-campaign-id="${id}"]`);
 if(btn)btn.textContent=`Donate ${input.value.trim()||'…'} NEAR`;
});

$('#onchainCampaign').addEventListener('click',async e=>{
 const btn=e.target.closest('.donateOnchainBtn');if(!btn)return;
 const id=Number(btn.dataset.campaignId),status=$(`#donationStatus-${id}`);
 const input=$(`#donationAmount-${id}`);
 let deposit;
 try{deposit=donationToYocto(input?.value);}catch(error){status.textContent=error.message;return;}
 if(!connectedAccount||!nearConnector){status.textContent='Please connect your NEAR Testnet wallet first.';return;}
 const amount=input.value.trim().replace(',','.');
 btn.disabled=true;btn.textContent='Waiting for wallet confirmation…';
 try{
  const wallet=await nearConnector.wallet();
  const result=await wallet.signAndSendTransaction({receiverId:escrowContractId,actions:[{type:'FunctionCall',params:{methodName:'donate',args:{campaign_id:id},gas:'100000000000000',deposit}}]});
  status.textContent='Transaction submitted. Updating campaign…';
  await afterEscrowTx(`donationStatus-${id}`,`Donation of ${amount} NEAR for campaign #${id} submitted on Testnet.`,result);
 }catch(error){
  console.error('Donation failed:',error);
  status.textContent=`Donation failed or cancelled: ${error.message}`;
  btn.disabled=false;btn.textContent=`Donate ${amount} NEAR`;
 }
});const fromBaseUnits=(raw,decimals)=>{const d=Number(decimals)||0;if(!/^\d+$/.test(String(raw??'')))return null;const s=String(raw).padStart(d+1,'0');const whole=s.slice(0,s.length-d),frac=s.slice(s.length-d).replace(/0+$/,'');return frac?`${whole}.${frac}`:whole;};
const assetSymbol=sel=>($(sel)?.selectedOptions[0]?.textContent||'').split('·')[0].trim();
const renderIntentSummary=q=>{const inSym=assetSymbol('#originAsset'),outSym=assetSymbol('#destinationAsset'),outDec=$('#destinationAsset')?.selectedOptions[0]?.dataset.decimals;const trim6=v=>/^\d+\.\d{7,}$/.test(String(v))?String(v).replace(/(\.\d{6})\d+$/,'$1'):v;const withSym=(v,sym)=>v&&v!=='Not supplied'&&sym?`${trim6(v)} ${sym}`:v;const minOut=q.minAmountOutFormatted||fromBaseUnits(q.minAmountOut,outDec)||q.minAmountOut||'Not supplied';return `<strong>Live quote received</strong><br>Input: ${esc(withSym(q.amountInFormatted||q.amountIn||'Not supplied',inSym))}<br>Expected output: ${esc(withSym(q.amountOutFormatted||q.amountOut||'Not supplied',outSym))}${q.amountOutUsd?` <span style="opacity:.75">(≈ $${esc(Number(q.amountOutUsd).toFixed(2))})</span>`:''}<br>Minimum output: ${esc(withSym(minOut,outSym))}<br>Estimated time: ${esc(q.timeEstimate?`${Math.ceil(q.timeEstimate/60)} min`:'Not supplied')}`;};

$('#getQuoteBtn').addEventListener('click',async()=>{
 const result=$('#quoteResult'),originAsset=$('#originAsset').value,destinationAsset=$('#destinationAsset').value;
 let amount;
 try{amount=intentsToBaseUnits($('#intentAmount').value,$('#originAsset').selectedOptions[0]?.dataset.decimals??'0');}
 catch(error){result.textContent=error.message;result.scrollIntoView({behavior:'smooth',block:'center'});return;}
 const payload={originAsset,destinationAsset,amount,recipient:$('#intentRecipient').value.trim(),refundTo:$('#intentRefund').value.trim(),confidentiality:$('#intentPrivacy').value,slippageTolerance:100};
 if(!originAsset||!destinationAsset||!payload.recipient||!payload.refundTo){result.textContent='Choose both assets and enter a recipient address and a source-chain refund address.';result.scrollIntoView({behavior:'smooth',block:'center'});return;}
 if(originAsset===destinationAsset){result.textContent='Choose two different assets to request a swap quote.';result.scrollIntoView({behavior:'smooth',block:'center'});return;}
 intentPayload=payload;intentDeposit=null;$('#depositControls').innerHTML='';result.textContent='Requesting a dry quote from NEAR Intents…';$('#getQuoteBtn').disabled=true;$('#getQuoteBtn').textContent='Requesting quote…';
 try{
  const accessToken=payload.confidentiality!=='public'?await getConfidentialAccessToken():null;
  const data=await api('/api/near-intents/quote-preview',{method:'POST',headers:accessToken?{Authorization:`Bearer ${accessToken}`}:{},body:JSON.stringify(payload)}),quote=data.quote||data;
  result.innerHTML=`${renderIntentSummary(quote)}<br><small>PREVIEW ONLY · no deposit address and no funds moved</small>`;
  $('#depositControls').innerHTML='<button class="btn btn-primary" id="createIntentDeposit">Create deposit instructions</button><p class="modal-note">This requests a non-dry quote and a deposit address. Sending funds remains a separate wallet action.</p>';
 }catch(error){result.textContent=`Quote unavailable: ${error.message}. Check the asset pair, addresses and API configuration.`;result.scrollIntoView({behavior:'smooth',block:'center'});}
 finally{$('#getQuoteBtn').disabled=false;$('#getQuoteBtn').textContent='Get live quote preview ↗';}
});

$('#depositControls').addEventListener('click',async e=>{if(e.target.id==='createIntentDeposit'){const btn=e.target;btn.disabled=true;btn.textContent='Creating deposit instructions…';try{const accessToken=intentPayload.confidentiality!=='public'?await getConfidentialAccessToken():null;const data=await api('/api/near-intents/quote',{method:'POST',headers:accessToken?{Authorization:`Bearer ${accessToken}`}:{},body:JSON.stringify(intentPayload)}),q=data.quote||data;intentDeposit={...q,depositAddress:q.depositAddress||data.depositAddress,depositMemo:q.depositMemo||data.depositMemo,deadline:q.deadline||data.deadline};if(!intentDeposit.depositAddress)throw new Error('The service returned no deposit address. No deposit can be made.');$('#quoteResult').innerHTML=`${renderIntentSummary(q)}<br><strong>Deposit instructions are ready</strong><br><small>QUOTE EXPIRES: ${esc(intentDeposit.deadline||'Check the expiry in your wallet/service response')}</small>`;$('#depositControls').innerHTML=`<label>DEPOSIT ADDRESS</label><textarea readonly rows="3">${esc(intentDeposit.depositAddress)}</textarea>${intentDeposit.depositMemo?`<label>DEPOSIT MEMO</label><input readonly value="${esc(intentDeposit.depositMemo)}">`:''}<p class="modal-note">Open your wallet, check the asset and amount carefully, then send to this address before the quote expires. ImpactFlow does not initiate or sign the transfer.</p><label for="intentTxHash">TRANSACTION HASH (OPTIONAL)</label><input id="intentTxHash" placeholder="Paste after sending from your wallet"><button class="btn btn-primary" id="submitIntentTx">Notify NEAR Intents about deposit</button><button class="btn btn-small" id="checkIntentStatus">Track swap status</button><div id="intentStatus" class="quote-result" aria-live="polite">Waiting for you to send funds from your wallet.</div>`;}catch(err){$('#quoteResult').textContent=`Could not create deposit instructions: ${err.message}`;btn.disabled=false;btn.textContent='Try again';}}

if(e.target.id==='submitIntentTx'){const txHash=$('#intentTxHash').value.trim(),b=e.target;if(!txHash){$('#intentStatus').textContent='Paste the transaction hash from your wallet first.';return;}b.disabled=true;try{const data=await api('/api/near-intents/deposit-submit',{method:'POST',body:JSON.stringify({txHash,depositAddress:intentDeposit.depositAddress,memo:intentDeposit.depositMemo,nearSenderAccount:connectedAccount||undefined})});$('#intentStatus').textContent=`Deposit submitted for tracking. ${data.status||data.message||''}`; }catch(err){$('#intentStatus').textContent=`Could not submit transaction: ${err.message}`;}finally{b.disabled=false;}}

if(e.target.id==='checkIntentStatus'){const box=$('#intentStatus'),btn=e.target,terminal=new Set(['SUCCESS','FAILED','REFUNDED','INCOMPLETE_DEPOSIT']);btn.disabled=true;btn.textContent='Tracking swap…';try{const params=new URLSearchParams({depositAddress:intentDeposit.depositAddress});if(intentDeposit.depositMemo)params.set('depositMemo',intentDeposit.depositMemo);for(let attempt=0;attempt<60;attempt++){const data=await api(`/api/near-intents/status?${params}`),status=String(data.status||'UNKNOWN').toUpperCase();box.textContent=`NEAR Intents status: ${status}${data.updatedAt?` · updated ${data.updatedAt}`:''}`;if(terminal.has(status)){box.innerHTML=`<strong>${status==='SUCCESS'?'Swap complete':status==='REFUNDED'?'Swap refunded':status==='INCOMPLETE_DEPOSIT'?'Deposit incomplete':'Swap failed'}</strong><br>${esc(data.swapDetails?.amountOutFormatted?`Received ${data.swapDetails.amountOutFormatted}`:data.refundReason||'See status details in the NEAR Intents response.')}`;return;}await new Promise(resolve=>setTimeout(resolve,3000));}}catch(err){box.textContent=`Status unavailable: ${err.message}`;}finally{btn.disabled=false;btn.textContent='Track swap status';}}});

$('#createBtn').addEventListener('click',async()=>{if(!currentUser)return accountModal('register');try{const {organization}=await api('/api/organizations/me');if(!organization)return organizationModal();projectModal();}catch(e){toast(e.message)}});
const primaryNav=$('#primaryNav'),menuButton=$('#menuBtn');
function closeMenu(){primaryNav.classList.remove('open');menuButton.setAttribute('aria-expanded','false');menuButton.setAttribute('aria-label','Open menu');menuButton.textContent='☰';}
menuButton.addEventListener('click',()=>{const isOpen=primaryNav.classList.toggle('open');menuButton.setAttribute('aria-expanded',String(isOpen));menuButton.setAttribute('aria-label',isOpen?'Close menu':'Open menu');menuButton.textContent=isOpen?'×':'☰';});
primaryNav.addEventListener('click',e=>{const link=e.target.closest('a');if(!link)return;closeMenu();if(link.classList.contains('mobile-account-link')){e.preventDefault();menuButton.focus();$('#registerBtn').click();}});

const sum=8420+6180+4250;$('#totalRaised').textContent='$'+sum.toLocaleString('en-US');$('#heroRaised').textContent='$'+sum.toLocaleString('en-US');

refreshAccount();updateWalletUI();initNearConnect();loadIntentTokens();loadOnchainCampaign();loadLiveLedger();
