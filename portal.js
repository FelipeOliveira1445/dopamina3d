(() => {
const $ = s => document.querySelector(s);
const money = n => Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const date = d => {
 if(!d)return '—';
 const raw=String(d);
 const parsed=/^\d{4}-\d{2}-\d{2}$/.test(raw)?new Date(raw+'T12:00:00'):new Date(raw);
 return Number.isNaN(parsed.getTime())?'—':parsed.toLocaleDateString('pt-BR');
};
const BUILD='2026-11-11v10';let toastTimer=null;
const friendlyError = raw => {
 const msg=String(raw?.message||raw||'').trim();
 const lower=msg.toLowerCase();
 if(!msg)return 'Não foi possível concluir a operação. Tente novamente.';
 if(/invalid login credentials|invalid email or password/.test(lower))return 'E-mail ou senha incorretos.';
 if(/email not confirmed/.test(lower))return 'Confirme seu e-mail antes de entrar.';
 if(/user is banned|user not allowed/.test(lower))return 'Este acesso está desativado. Entre em contato com a administração.';
 if(/auth session missing|session missing/.test(lower))return 'Sua sessão expirou. Entre novamente.';
 if(/jwt expired|invalid jwt|token is expired/.test(lower))return 'Sua sessão expirou. Entre novamente.';
 if(/permission denied|row-level security|rls|not authorized|unauthorized|forbidden/.test(lower))return 'Você não tem permissão para realizar esta ação.';
 if(/failed to fetch|networkerror|fetch failed/.test(lower))return 'Falha de conexão. Verifique sua internet e tente novamente.';
 if(/duplicate key|already exists/.test(lower))return 'Já existe um registro com esses dados.';
 if(/violates foreign key/.test(lower))return 'Não foi possível concluir porque existem registros vinculados.';
 if(/password should be|password.*at least/.test(lower))return 'A senha não atende aos requisitos mínimos.';
 return msg.length>180 ? msg.slice(0,177)+'…' : msg;
};
const toast = (message,type) => {
 const t=$('#toast'); if(!t)return;
 const raw=String(message??'');
 const lower=raw.toLowerCase();
 const kind=type||(/sucesso|salvo|atualizad|cadastrad|enviado|concluíd|excluíd/.test(lower)?'success':/não foi possível|erro|falha|inválid|negad|não autorizado|expir/.test(lower)?'error':/atenção|verifique|confirme/.test(lower)?'warning':'info');
 const icon=t.querySelector('.toast-icon'), label=t.querySelector('.toast-message');
 t.dataset.type=kind; label.textContent=kind==='error'?friendlyError(raw):raw;
 t.classList.add('show');
 clearTimeout(toastTimer);
 toastTimer=setTimeout(()=>t.classList.remove('show'),5000);
};
const dismissToast=()=>{const t=$('#toast');if(t)t.classList.remove('show');clearTimeout(toastTimer)};
document.addEventListener('click',e=>{if(e.target.closest('.toast-close'))dismissToast()});
// Evita perda acidental ao fechar/recarregar a página; navegar entre abas internas não aciona este aviso.
document.addEventListener('input',e=>{const form=e.target.closest('#content form');if(form)form.dataset.unsaved='true';});
document.addEventListener('change',e=>{const form=e.target.closest('#content form');if(form)form.dataset.unsaved='true';});
// Os formulários sensíveis mantêm rascunhos locais; não bloqueamos o retorno do seletor
// de arquivos mobile com beforeunload, que pode provocar um ciclo de navegação no WebView.
const configOk = window.DOPAMINA_SUPABASE_URL && !window.DOPAMINA_SUPABASE_URL.includes('SEU-PROJETO') && window.DOPAMINA_SUPABASE_ANON_KEY && !window.DOPAMINA_SUPABASE_ANON_KEY.includes('SUA_CHAVE');
let sb=null, profile=null, currentTab='dashboard', sessionTask=null, passwordRecoveryMode=false, passwordJustUsed=null, appShownKey=null, scrollLocked=false;
// Mantém o DOM de cada aba em memória ao navegar. Isso preserva formulários,
// listeners e FileList (inclusive arquivos selecionados no gerenciador mobile).
const tabContentCache=new Map();
const tabScrollPositions=new Map();
function tabScrollKey(tab){return `dopamina3d:scroll:${profile?.id||'anonymous'}:${tab}`;}
function rememberTabScroll(tab){
 const y=window.scrollY||document.documentElement.scrollTop||0;
 tabScrollPositions.set(tab,y);
 try{sessionStorage.setItem(tabScrollKey(tab),String(y));}catch(e){}
}
function restoreTabScroll(tab){
 let y=tabScrollPositions.get(tab)||0;
 try{y=Math.max(y,Number(sessionStorage.getItem(tabScrollKey(tab))||0));}catch(e){}
 requestAnimationFrame(()=>requestAnimationFrame(()=>{window.scrollTo({top:y,left:0,behavior:'instant'});scrollLocked=false;}));
}
let scrollSaveFrame=false;
window.addEventListener('scroll',()=>{
 if(scrollSaveFrame||scrollLocked)return;
 scrollSaveFrame=true;
 requestAnimationFrame(()=>{if(!scrollLocked)rememberTabScroll(currentTab);scrollSaveFrame=false;});
},{passive:true});
let tabLoadSequence=0;
const navItems = {
 admin:[['dashboard','Visão geral'],['production','Central de produção'],['catalog','Produtos e estoque'],['orders','Pedidos'],['shipments','Expedição'],['reports','Relatórios'],['contracts','Contratos'],['finance','Financeiro'],['users','Clientes e equipe'],['audit','Auditoria']],
 collaborator:[['dashboard','Visão geral'],['production','Central de produção'],['catalog','Produtos e estoque'],['orders','Pedidos'],['shipments','Expedição'],['contracts','Contratos']],
 reseller:[['dashboard','Início'],['contract','Meu contrato'],['neworder','Pedir peças'],['myshipments','Minhas remessas'],['myorders','Meus pedidos']],
 customer:[['dashboard','Minha conta']]
};
const labels={admin:'Administrador',collaborator:'Colaborador',reseller:'Revendedor',customer:'Cliente'};
function showLogin(msg=''){ appShownKey=null; $('#loginView').classList.remove('hidden');$('#appView').classList.add('hidden');$('#loginForm').classList.remove('hidden');$('#resetPasswordBox')?.classList.add('hidden');$('#loginMsg').textContent=msg; }
function showApp(){ appShownKey=(profile?.id||'')+':'+(profile?.role||''); $('#loginView').classList.add('hidden');$('#appView').classList.remove('hidden');$('#userInfo').innerHTML=`<b>${escapeHtml(profile.full_name||profile.email||'Usuário')}</b><br>${escapeHtml(profile.email||'')}<br><span class="pill">${labels[profile.role]||profile.role}</span>`;$('#rolePill').textContent=labels[profile.role]||profile.role;$('#userInfo').insertAdjacentHTML('beforeend','<br><small style="opacity:.55">versão '+BUILD+'</small>');renderNav();let saved='dashboard';try{saved=sessionStorage.getItem('dopamina3d:lastTab:'+profile.id)||'dashboard';}catch(e){}loadTab(saved,true);}
function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function saveIconButton(label='Salvar'){
 return `<button type="submit" class="icon-save-btn" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h12l4 4v14H3V3h2Z"/><path d="M7 3v6h10V3M7 21v-7h10v7M9 17h6"/></svg></button>`;
}
function deleteIconButton(attrs,label='Excluir'){
 return `<button type="button" class="icon-delete-btn" ${attrs} aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m4 4v6m6-6v6"/></svg></button>`;
}

async function productAdminRequest(payload){
 const {data,error}=await sb.functions.invoke('product-admin',{body:payload});
 if(error)throw new Error(data?.error||error.message||'Falha na operação administrativa.');
 if(data?.error)throw new Error(data.error);
 return data;
}

function openMobileDrawer(){
 const shell=$('#appView'),btn=$('#mobileMenuToggle');
 if(!shell||window.matchMedia('(min-width: 901px)').matches)return;
 shell.classList.add('drawer-open');btn?.setAttribute('aria-expanded','true');
 document.body.classList.add('drawer-lock');
}
function closeMobileDrawer(){
 const shell=$('#appView'),btn=$('#mobileMenuToggle');
 if(!shell)return;
 shell.classList.remove('drawer-open');btn?.setAttribute('aria-expanded','false');
 document.body.classList.remove('drawer-lock');
}
document.addEventListener('click',e=>{
 if(e.target.closest('#mobileMenuToggle')){openMobileDrawer();return;}
 if(e.target.closest('#mobileDrawerBackdrop'))closeMobileDrawer();
});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMobileDrawer();});
window.addEventListener('resize',()=>{if(window.matchMedia('(min-width: 901px)').matches)closeMobileDrawer();});
function renderNav(){const items=navItems[profile.role]||[];$('#nav').innerHTML=items.map(([id,label])=>`<button data-tab="${id}" class="${id===currentTab?'active':''}"><span class="dot"></span>${label}</button>`).join('');$('#nav').querySelectorAll('button').forEach(b=>b.onclick=()=>{loadTab(b.dataset.tab);closeMobileDrawer()});}
function setTitle(title){$('#pageTitle').textContent=title;$('#crumb').textContent='Dopamina 3D · '+title;}
async function loadTab(tab,force=false){
 // Auditoria sempre consulta o banco ao entrar na aba; não reutiliza fragmento em cache.
 if(tab==='audit')force=true;
 const allowed=(navItems[profile?.role]||[]).some(([id])=>id===tab);
 if(!allowed){$('#content').innerHTML='<div class="card alert">Você não tem permissão para acessar esta área.</div>';return;}
 const content=$('#content'),previousTab=currentTab;
 if(tab!==previousTab)rememberTabScroll(previousTab);
 // Ao trocar de aba, guarda os nós reais (não uma cópia HTML), preservando estado,
 // handlers e arquivos selecionados. A aba atual continua viva em memória.
 if(tab!==previousTab && content.childNodes.length){
  const fragment=document.createDocumentFragment();
  while(content.firstChild)fragment.append(content.firstChild);
  tabContentCache.set(previousTab,fragment);
 }
 currentTab=tab;try{sessionStorage.setItem('dopamina3d:lastTab:'+profile.id,tab);}catch(e){}renderNav();
 const titles={dashboard:'Visão geral',production:'Central de produção',catalog:'Produtos e estoque',orders:'Pedidos',shipments:'Expedição',reports:'Relatórios',contracts:'Contratos',finance:'Financeiro',users:'Clientes e equipe',audit:'Auditoria',contract:'Meu contrato',neworder:'Solicitar peças',myshipments:'Minhas remessas',myorders:'Meus pedidos'};setTitle(titles[tab]||'Painel');
 if(!force && tabContentCache.has(tab)){
  content.replaceChildren(tabContentCache.get(tab));tabContentCache.delete(tab);restoreTabScroll(tab);return;
 }
 if(force)tabContentCache.delete(tab);
 const sequence=++tabLoadSequence;
 // Trava o salvamento de rolagem: o aviso "Carregando" encolhe a página e o navegador força scrollTop=0,
 // o que apagaria a posição guardada antes de ela ser restaurada.
 scrollLocked=true;setTimeout(()=>{scrollLocked=false;},4000);
 content.innerHTML='<div class="card empty">Carregando informações...</div>';
 try{
  if(tab==='dashboard' && profile.role==='customer') await customerDashboard();
  else if(tab==='dashboard') await dashboard();
  else if(tab==='catalog') await catalog();
  else if(tab==='production') await productionBoard();
  else if(tab==='reports') await reports();
  else if(tab==='finance') await finance();
  else if(tab==='orders'||tab==='myorders') await orders(tab==='myorders');
  else if(tab==='shipments'||tab==='myshipments') await shipments(tab==='myshipments');
  else if(tab==='contracts'||tab==='contract') await contracts(tab==='contract');
  else if(tab==='neworder') await newOrder();
  else if(tab==='users') await users();
  else if(tab==='audit' && profile.role==='admin') await auditLog();
 }catch(e){if(sequence===tabLoadSequence)content.innerHTML=`<div class="card alert">Não foi possível carregar esta área: ${escapeHtml(e.message||e)}. Verifique as políticas RLS e se o banco foi configurado.`;}
 if(sequence===tabLoadSequence)restoreTabScroll(tab);
}

function auditValue(value){
 if(value===null||value===undefined||value==='')return '<span class="audit-empty">—</span>';
 if(typeof value==='object')return `<pre class="audit-json">${escapeHtml(JSON.stringify(value,null,2))}</pre>`;
 return escapeHtml(String(value));
}
function auditTableLabel(key){
 const labels={profiles:'Clientes e usuários',products:'Produtos',orders:'Pedidos de revendedores',order_items:'Itens dos pedidos',manual_orders:'Pedidos avulsos',manual_order_items:'Itens dos pedidos avulsos',shipments:'Remessas de consignação',shipment_items:'Itens das remessas',shipment_return_items:'Peças devolvidas',contracts:'Contratos',contract_data:'Dados dos contratos',contract_settings:'Configurações de contratos',financial_transactions:'Lançamentos financeiros',audit_logs:'Registros de auditoria',product_internal_data:'Dados internos dos produtos'};
 return labels[key]||key.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
}
function auditFieldLabel(key){
 const labels={id:'Identificador',created_at:'Criado em',updated_at:'Última modificação',full_name:'Nome completo',email:'E-mail',role:'Perfil de acesso',name:'Nome',description:'Descrição',price:'Preço de venda',wholesale_price:'Preço de atacado',stock_quantity:'Quantidade em estoque',status:'Situação',total:'Valor total',subtotal:'Subtotal',order_type:'Modalidade do pedido',notes:'Observações',quantity:'Quantidade',unit_price:'Preço unitário',reseller_id:'Revendedor',file_path:'Arquivo',payment_attachment_path:'Comprovante de pagamento',payment_attached_at:'Data do comprovante',amount:'Valor',type:'Tipo',date:'Data',category:'Categoria',attachment_path:'Anexo',shipment_date:'Data da remessa',payment_status:'Situação do pagamento',customer_name:'Nome do cliente',customer_phone:'Telefone',customer_email:'E-mail do cliente',channel:'Canal de venda',product_id:'Produto',product_name:'Nome do produto',availability:'Disponibilidade',competence_month:'Mês de competência',created_by:'Criado por',actor_id:'Responsável pela ação',actor_role:'Perfil do responsável',table_name:'Tabela/área',record_id:'Registro',operation:'Operação',old_data:'Dados anteriores',new_data:'Dados posteriores',changed_fields:'Campos alterados',settlement_date:'Data do acerto',settlement_amount:'Valor do acerto',settlement_has_unsold:'Houve devoluções?',settlement_unsold_details:'Detalhes das devoluções',unit_wholesale_price:'Preço unitário de atacado',digital_signature_status:'Situação da assinatura digital',signed_at:'Data da assinatura'};
 return labels[key]||key.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
}
function auditOperationLabel(op){return ({INSERT:'Criação',UPDATE:'Alteração',DELETE:'Exclusão'})[op]||op;}
function auditRoleLabel(role){return ({admin:'Administrador',collaborator:'Colaborador',reseller:'Revendedor',system:'Sistema',unknown:'Não identificado'})[String(role||'').toLowerCase()]||role||'Sistema';}
function auditModal(row){
 const before=row.old_data||{},after=row.new_data||{},fields=Array.isArray(row.changed_fields)?row.changed_fields:[];
 const list=fields.length?fields:Object.keys(after).length?Object.keys(after):Object.keys(before);
 const content=list.map(k=>`<tr><th>${escapeHtml(auditFieldLabel(k))}<small>${escapeHtml(k)}</small></th><td>${auditValue(before[k])}</td><td>${auditValue(after[k])}</td></tr>`).join('');
 const overlay=document.createElement('div');overlay.className='audit-modal-backdrop';
 overlay.innerHTML=`<section class="audit-modal" role="dialog" aria-modal="true" aria-labelledby="auditModalTitle"><header><div><span class="eyebrow">REGISTRO DE AUDITORIA</span><h2 id="auditModalTitle">${escapeHtml(auditOperationLabel(row.operation))} · ${escapeHtml(auditTableLabel(row.table_name))}</h2><p>${escapeHtml(row.actor?.full_name||row.actor?.email||'Sistema')} · ${new Date(row.created_at).toLocaleString('pt-BR')}</p></div><button class="btn secondary" data-audit-close aria-label="Fechar">✕</button></header><div class="audit-modal-meta"><span><b>Registro:</b> ${escapeHtml(row.record_id||'—')}</span><span><b>Perfil:</b> ${escapeHtml(auditRoleLabel(row.actor_role))}</span><span><b>Campos:</b> ${list.length}</span></div><div class="table-wrap"><table class="table audit-diff"><thead><tr><th>Campo</th><th>Antes</th><th>Depois</th></tr></thead><tbody>${content||'<tr><td colspan="3">Sem detalhes de campos disponíveis.</td></tr>'}</tbody></table></div><footer><button class="btn secondary" data-audit-close>Fechar</button></footer></section>`;
 document.body.append(overlay);const close=()=>overlay.remove();overlay.querySelectorAll('[data-audit-close]').forEach(b=>b.onclick=close);overlay.onclick=e=>{if(e.target===overlay)close();};document.addEventListener('keydown',function esc(e){if(e.key==='Escape'){close();document.removeEventListener('keydown',esc);}});
}
async function auditLog(){
 if(profile?.role!=='admin'){ $('#content').innerHTML='<div class="card alert">A auditoria é exclusiva do administrador.</div>';return;}
 const {data,error}=await sb.from('audit_logs').select('id,actor_id,actor_role,table_name,record_id,operation,old_data,new_data,changed_fields,created_at,actor:profiles!audit_logs_actor_id_fkey(full_name,email)').order('created_at',{ascending:false}).limit(500);
 if(error)throw error;
 const rows=data||[];
 $('#content').innerHTML=`<div class="section-head"><div><span class="eyebrow">RASTREABILIDADE E SEGURANÇA</span><h2>Auditoria do sistema</h2><p class="muted">Histórico de alterações realizadas nos registros, com comparação dos valores anteriores e posteriores.</p></div><button class="btn secondary" id="refreshAudit">↻ Atualizar</button></div><div class="grid audit-metrics">${metric('Eventos registrados',rows.length,'Últimos 500 eventos')}${metric('Alterações',rows.filter(x=>x.operation==='UPDATE').length,'Registros modificados')}${metric('Criações',rows.filter(x=>x.operation==='INSERT').length,'Novos registros')}${metric('Exclusões',rows.filter(x=>x.operation==='DELETE').length,'Registros removidos')}</div><section class="card section"><div class="audit-toolbar"><input id="auditSearch" placeholder="Buscar por usuário, tabela, registro ou campo..."><select id="auditOperation"><option value="">Todas as operações</option><option value="INSERT">Criações</option><option value="UPDATE">Alterações</option><option value="DELETE">Exclusões</option></select><input type="date" id="auditDate"></div><div class="table-wrap"><table class="table audit-table"><thead><tr><th></th><th>Data e hora</th><th>Usuário</th><th>Ação</th><th>Área</th><th>Campos</th></tr></thead><tbody id="auditRows"></tbody></table></div><div class="muted audit-foot">Exibindo até 500 eventos mais recentes. O acesso a esta área é restrito ao administrador.</div></section>`;
 const tbody=$('#auditRows');
 const draw=()=>{
  const q=$('#auditSearch').value.trim().toLocaleLowerCase('pt-BR'),op=$('#auditOperation').value,day=$('#auditDate').value;
  const filtered=rows.filter(r=>{const who=(r.actor?.full_name||r.actor?.email||'Sistema'),hay=[who,r.table_name,auditTableLabel(r.table_name),r.record_id,r.operation,auditOperationLabel(r.operation),...(r.changed_fields||[]).map(auditFieldLabel)].join(' ').toLocaleLowerCase('pt-BR');return(!q||hay.includes(q))&&(!op||r.operation===op)&&(!day||r.created_at.slice(0,10)===day);});
  tbody.innerHTML=filtered.map(r=>`<tr><td><button class="audit-info" data-audit-id="${r.id}" title="Detalhar alteração" aria-label="Detalhar alteração">i</button></td><td>${new Date(r.created_at).toLocaleDateString('pt-BR')}<small class="audit-time">${new Date(r.created_at).toLocaleTimeString('pt-BR')}</small></td><td>${escapeHtml(r.actor?.full_name||r.actor?.email||'Sistema')}</td><td><span class="audit-op ${r.operation.toLowerCase()}">${escapeHtml(auditOperationLabel(r.operation))}</span></td><td>${escapeHtml(r.table_name)}</td><td>${(r.changed_fields||[]).length}</td></tr>`).join('')||'<tr><td colspan="6" class="empty">Nenhum evento encontrado para os filtros selecionados.</td></tr>';
  tbody.querySelectorAll('[data-audit-id]').forEach(b=>b.onclick=()=>{const row=filtered.find(x=>x.id===b.dataset.auditId);if(row)auditModal(row);});
 };
 ['auditSearch','auditOperation','auditDate'].forEach(id=>$('#'+id).addEventListener(id==='auditSearch'?'input':'change',draw));
 $('#refreshAudit').onclick=()=>loadTab('audit',true);
 draw();
}

function quickActionIcon(id){
 const paths={production:'<path d="M4 19V5l8-3 8 3v14l-8 3-8-3Z"/><path d="m4 5 8 3 8-3M12 8v14"/>',catalog:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',orders:'<path d="M7 3h10l4 4v14H3V3h4Z"/><path d="M7 3v6h10V3M7 21v-7h10v7"/>',reports:'<path d="M4 20V10m8 10V4m8 16v-7"/>',finance:'<path d="M12 2v20m5-16H9a3 3 0 0 0 0 6h6a3 3 0 0 1 0 6H6"/>',shipments:'<path d="M3 7h11v12H3zM14 11h4l3 3v5h-7"/><circle cx="7.5" cy="19" r="1.5"/><circle cx="17.5" cy="19" r="1.5"/>',neworder:'<path d="M12 5v14M5 12h14"/>',myorders:'<path d="M7 3h10l4 4v14H3V3h4Z"/><path d="M7 3v6h10V3M7 21v-7h10v7"/>',myshipments:'<path d="M3 7h11v12H3zM14 11h4l3 3v5h-7"/><circle cx="7.5" cy="19" r="1.5"/><circle cx="17.5" cy="19" r="1.5"/>',contract:'<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v5h4M9 13h7m-7 4h7"/>'};
 return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[id]||'<circle cx="12" cy="12" r="8"/>'}</svg>`;
}
async function dashboard(){
 const admin=profile.role==='admin', reseller=profile.role==='reseller';
 const [products,ordersRes,shipmentsRes,txRes,lowRes]=await Promise.all([
  sb.from('products').select('id,name,stock_quantity,active').eq('active',true),
  sb.from('orders').select('id,status,total,created_at,profiles(full_name,email)').order('created_at',{ascending:false}),
  sb.from('shipments').select('id,status').limit(200),
  admin?sb.from('financial_transactions').select('type,amount').eq('competence_month',new Date().toISOString().slice(0,7)):Promise.resolve({data:[]}),
  admin?sb.from('products').select('id,name,stock_quantity').eq('active',true).lte('stock_quantity',5).order('stock_quantity'):Promise.resolve({data:[]})
 ]);
 for(const r of [products,ordersRes,shipmentsRes,txRes,lowRes])if(r.error)throw r.error;
 let os=ordersRes.data||[],ss=shipmentsRes.data||[],ps=products.data||[];
 if(reseller){const ownOrders=await sb.from('orders').select('id,status,total,created_at').eq('reseller_id',profile.id).order('created_at',{ascending:false}).limit(8);if(ownOrders.error)throw ownOrders.error;os=ownOrders.data||[];}
 let mo=[];if(!reseller){const m=await sb.from('manual_orders').select('id,customer_name,status,total,payment_status,created_at').order('created_at',{ascending:false});mo=m.error?[]:(m.data||[]);os=[...os,...mo.map(x=>({...x,_manual:true,profiles:{full_name:x.customer_name}}))].sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));}
 const moOpen=mo.filter(x=>!['completed','cancelled'].includes(x.status)),moToReceive=mo.filter(x=>x.payment_status!=='paid'&&x.status!=='cancelled').reduce((a,x)=>a+Number(x.total||0),0);
 const rev=(txRes.data||[]).filter(x=>x.type==='income').reduce((a,x)=>a+Number(x.amount||0),0),exp=(txRes.data||[]).filter(x=>x.type==='expense').reduce((a,x)=>a+Number(x.amount||0),0);
 const pending=os.filter(x=>x.status==='pending').length,producing=os.filter(x=>x.status==='producing').length,low=lowRes.data||[];
 const cards=reseller?[metric('Pedidos realizados',os.length,'Seus pedidos recentes'),metric('Em andamento',os.filter(x=>!['completed','cancelled'].includes(x.status)).length,'Pedidos não finalizados'),metric('Peças disponíveis',ps.length,'Itens ativos no catálogo')]:[
  metric('Pedidos recebidos',os.length,'Inclui pedidos avulsos'),metric('Aguardando análise',pending,'Precisam de aprovação'),metric('Em produção',producing,'Pedidos na fabricação'),metric('Pedidos avulsos',mo.length,`${moOpen.length} em andamento · ${money(moToReceive)} a receber`),metric('Produtos ativos',ps.length,'No catálogo') ,...(admin?[metric('Receita do mês',money(rev),'Lançamentos financeiros'),metric('Despesas do mês',money(exp),'Lançamentos financeiros'),metric('Resultado',money(rev-exp),'Receita menos despesas'),metric('Itens com estoque crítico',low.length,'Cinco unidades ou menos')]:[])
 ];
 const recent=os.slice(0,6).map(o=>`<tr><td><b>#${o.id.slice(0,8)}</b>${o._manual?' <span class="status wait">Avulso</span>':''}</td>${reseller?'':`<td>${escapeHtml(o.profiles?.full_name||o.profiles?.email||'—')}</td>`}<td>${date(o.created_at?.slice(0,10))}</td><td>${money(o.total)}</td><td>${statusPill(o.status)}</td></tr>`).join('');
 const stockAlerts=admin?`<section class="card panel-section"><div class="section-head"><div><span class="eyebrow">Atenção ao estoque</span><h2>Reposição recomendada</h2></div><button class="btn secondary" data-go="catalog">Abrir estoque</button></div>${low.length?`<div class="alert-list">${low.slice(0,5).map(x=>`<div class="alert-item"><span class="alert-symbol">!</span><div><b>${escapeHtml(x.name)}</b><small>${Number(x.stock_quantity||0)===0?'Sem unidades disponíveis':`${x.stock_quantity} unidade(s) restantes`}</small></div><span class="status bad">Crítico</span></div>`).join('')}</div>`:'<div class="empty-state">Estoque saudável. Nenhum produto abaixo do limite de segurança.</div>'}</section>`:'';
 const actions=reseller?[['neworder','＋','Solicitar reposição'],['myorders','▤','Acompanhar pedidos'],['myshipments','↗','Ver remessas'],['contract','⌑','Meu contrato']]:[['production','◈','Abrir produção'],['catalog','▦','Gerenciar produtos'],['orders','▤','Ver pedidos'],...(admin?[['reports','▥','Relatórios'],['finance','＄','Financeiro']]:[]),['shipments','↗','Expedição']];
 $('#content').innerHTML=`<section class="welcome-banner"><div><span class="eyebrow">${admin?'CENTRO DE COMANDO · DOPAMINA 3D':reseller?'ÁREA DO REVENDEDOR':'OPERAÇÃO DOPAMINA 3D'}</span><h2>${admin?'Sua operação, sob controle.':`Olá, ${escapeHtml(profile.full_name?.split(' ')[0]||'tudo bem')}!`}</h2><p>${admin?'Acompanhe pedidos, produção, estoque e desempenho em um só lugar.':'Acompanhe seus pedidos e mantenha sua operação sempre abastecida.'}</p></div><div class="welcome-orbit"><span>3D</span><i></i><b></b></div></section>
 <div class="grid dashboard-metrics">${cards.join('')}</div>
 <section class="card panel-section"><div class="section-head"><div><span class="eyebrow">Acesso rápido</span><h2>O que você precisa fazer?</h2></div></div><div class="quick-grid">${actions.map(([id,ico,label])=>`<button class="quick-action" data-go="${id}"><span>${quickActionIcon(id)}</span><b>${label}</b><small>Acessar módulo <i>↗</i></small></button>`).join('')}</div></section>
 <div class="dashboard-columns"><section class="card panel-section"><div class="section-head"><div><span class="eyebrow">Movimentação</span><h2>${reseller?'Seus pedidos recentes':'Pedidos recentes'}</h2></div><button class="btn secondary" data-go="${reseller?'myorders':'orders'}">Ver todos</button></div><div class="table-wrap"><table class="table"><thead><tr><th>Pedido</th>${reseller?'':'<th>Revendedor</th>'}<th>Data</th><th>Total</th><th>Situação</th></tr></thead><tbody>${recent||`<tr><td colspan="5" class="empty">Nenhum pedido registrado ainda.</td></tr>`}</tbody></table></div></section>${stockAlerts||`<section class="card panel-section"><span class="eyebrow">Próximo passo</span><h2>Faça sua próxima solicitação</h2><p class="muted">Consulte o catálogo e envie uma lista de peças para reposição.</p><button class="btn" data-go="neworder">Solicitar peças</button></section>`}</div>`;
 $('#content').querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>loadTab(b.dataset.go));
}
function statusPill(status){const labels={pending:'Aguardando análise',approved:'Aprovado',producing:'Em produção',shipped:'Enviado',completed:'Concluído',cancelled:'Cancelado'};return `<span class="status ${['approved','completed'].includes(status)?'ok':['cancelled'].includes(status)?'bad':'wait'}">${labels[status]||escapeHtml(status||'—')}</span>`;}
async function productionBoard(){
 const {data:od,error}=await sb.from('orders').select('*,profiles(full_name,email)').order('created_at',{ascending:true});if(error)throw error;
 const mo=await sb.from('manual_orders').select('id,customer_name,status,total,created_at').order('created_at',{ascending:true});
 const data=[...od,...(mo.data||[]).map(m=>({...m,order_type:'manual',profiles:{full_name:m.customer_name}}))].sort((a,b)=>String(a.created_at)<String(b.created_at)?-1:1);
 const stages=[['pending','Aguardando análise'],['approved','Aprovados'],['producing','Em produção'],['shipped','Prontos / enviados'],['completed','Concluídos'],['cancelled','Cancelados']];
 $('#content').innerHTML=`<div class="production-intro"><div><span class="eyebrow">FLUXO DE TRABALHO</span><h2>Da solicitação à entrega.</h2><p>Acompanhe todos os pedidos, inclusive os concluídos e cancelados, em uma visão única da operação.</p></div><button class="btn secondary" id="refreshProduction">↻ Atualizar fila</button></div><div class="grid production-summary">${metric('Pedidos no total',data.length,'Todos os registros')}${metric('Em andamento',data.filter(o=>['pending','approved','producing','shipped'].includes(o.status)).length,'Fila operacional')}${metric('Concluídos',data.filter(o=>o.status==='completed').length,'Pedidos finalizados')}${metric('Cancelados',data.filter(o=>o.status==='cancelled').length,'Histórico de cancelamentos')}</div><div class="production-board">${stages.map(([key,label])=>{const items=data.filter(o=>o.status===key);return `<section class="production-lane ${key==='cancelled'?'lane-cancelled':''}"><header><b>${label}</b><span>${items.length}</span></header><div class="lane-cards">${items.map(o=>`<article class="production-card"><div class="row between"><b>#${o.id.slice(0,8)}</b><small>${date(o.created_at?.slice(0,10))}</small></div><p>${escapeHtml(o.profiles?.full_name||o.profiles?.email||'Cliente')}</p><strong>${money(o.total)}</strong><div class="row between"><span class="muted">${escapeHtml(o.order_type==='manual'?'Avulso':o.order_type==='consignment'?'Consignação':o.order_type==='purchase'?'Compra':'Pedido')}</span>${key==='cancelled'?'<span class="status bad">Cancelado</span>':`<div class="production-stage-actions">${key!=='pending'&&key!=='completed'?`<button class="btn secondary" data-production-back="${o.id}" data-stage="${key}" data-manual="${o.order_type==='manual'?1:0}">← Retroceder</button>`:''}${key!=='completed'?`<button class="btn secondary" data-production-order="${o.id}" data-stage="${key}" data-manual="${o.order_type==='manual'?1:0}">Avançar</button>`:'<span class="status ok">Finalizado</span>'}</div>`}</div></article>`).join('')||'<div class="lane-empty">Nenhum pedido nesta etapa</div>'}</div></section>`}).join('')}</div>`;
 $('#refreshProduction').onclick=()=>productionBoard();
 const next={pending:['approved','Aprovar'],approved:['producing','Iniciar produção'],producing:['shipped','Marcar como enviado'],shipped:['completed','Concluir'],completed:null};
 const previous={approved:['pending','Retornar para aguardando análise'],producing:['approved','Retornar para aprovados'],shipped:['producing','Retornar para em produção']};
 const confirmProductionStage=(title,message,confirmLabel='Sim, confirmar')=>new Promise(resolve=>{
 let modal=document.getElementById('productionStageConfirmModal');
 if(!modal){
  modal=document.createElement('div');modal.id='productionStageConfirmModal';modal.className='confirm-modal hidden';
  modal.innerHTML=`<div class="confirm-modal-backdrop" data-stage-close></div><section class="confirm-modal-card production-stage-confirm-card" role="dialog" aria-modal="true" aria-labelledby="productionStageConfirmTitle"><button type="button" class="confirm-modal-x" data-stage-close aria-label="Fechar">×</button><span class="production-stage-confirm-icon" aria-hidden="true">↔</span><h2 id="productionStageConfirmTitle">Confirmar alteração?</h2><p class="confirm-modal-copy"></p><div class="confirm-modal-actions"><button type="button" class="btn secondary" data-stage-no>Não</button><button type="button" class="btn primary" data-stage-yes>Sim, confirmar</button></div></section>`;
  document.body.append(modal);
 }
 modal.querySelector('#productionStageConfirmTitle').textContent=title;
 modal.querySelector('.confirm-modal-copy').textContent=message;
 modal.querySelector('[data-stage-yes]').textContent=confirmLabel;
 modal.classList.remove('hidden');
 const yes=modal.querySelector('[data-stage-yes]');
 const finish=value=>{modal.classList.add('hidden');yes.removeEventListener('click',onYes);modal.querySelectorAll('[data-stage-close],[data-stage-no]').forEach(el=>el.removeEventListener('click',onNo));document.removeEventListener('keydown',onKey);resolve(value);};
 const onYes=()=>finish(true),onNo=()=>finish(false),onKey=e=>{if(e.key==='Escape')finish(false)};
 yes.addEventListener('click',onYes);modal.querySelectorAll('[data-stage-close],[data-stage-no]').forEach(el=>el.addEventListener('click',onNo));document.addEventListener('keydown',onKey);
});
const updateProductionStage=async(b,status,label,direction)=>{if(!status)return;const orderId=direction==='back'?b.dataset.productionBack:b.dataset.productionOrder;if(!orderId)return;const orderNumber=orderId.slice(0,8);const productionWarning=status==='producing'&&direction==='forward'?' Ao iniciar a produção, o pedido não poderá mais ser alterado (itens, quantidades e valores).':'';
if(!await confirmProductionStage(direction==='back'?'Retroceder pedido?':'Avançar pedido?',`${label}: pedido #${orderNumber}. Deseja realmente ${direction==='back'?'retroceder':'avançar'} este pedido?${productionWarning}`,direction==='back'?'Sim, retroceder':'Sim, avançar'))return;b.disabled=true;try{const r=await sb.from(b.dataset.manual==='1'?'manual_orders':'orders').update({status}).eq('id',orderId).select('id').maybeSingle();if(r.error)throw r.error;if(!r.data)throw new Error('Atualização não autorizada.');toast('Etapa atualizada.');await productionBoard();}catch(e){toast(`Não foi possível ${direction==='back'?'retroceder':'avançar'}: `+e.message);b.disabled=false;}};
 $('#content').querySelectorAll('[data-production-order]').forEach(b=>b.onclick=()=>{const [status,label]=next[b.dataset.stage]||[];return updateProductionStage(b,status,label,'forward');});
 $('#content').querySelectorAll('[data-production-back]').forEach(b=>b.onclick=()=>{const [status,label]=previous[b.dataset.stage]||[];return updateProductionStage(b,status,label,'back');});
}
async function reports(){
 const [p,o,t,s]=await Promise.all([sb.from('products').select('name,sku,category,price,stock_quantity,active').order('name'),sb.from('orders').select('id,status,total,order_type,created_at,profiles(full_name,email)').order('created_at',{ascending:false}),sb.from('financial_transactions').select('type,amount,date,category,description').order('date',{ascending:false}),sb.from('shipments').select('id,status,shipment_date,description,profiles!shipments_reseller_id_fkey(full_name)')]);for(const r of [p,o,t,s])if(r.error)throw r.error;
 const revenue=t.data.filter(x=>x.type==='income').reduce((a,x)=>a+Number(x.amount||0),0),expenses=t.data.filter(x=>x.type==='expense').reduce((a,x)=>a+Number(x.amount||0),0),totalOrders=o.data.reduce((a,x)=>a+Number(x.total||0),0),low=p.data.filter(x=>x.active&&Number(x.stock_quantity||0)<=5);
 $('#content').innerHTML=`<div class="report-hero"><span class="eyebrow">INTELIGÊNCIA OPERACIONAL</span><h2>Indicadores para decidir melhor.</h2><p>Resumo consolidado dos dados cadastrados no sistema. Exporte cada relatório no formato desejado.</p></div><div class="grid">${metric('Valor total dos pedidos',money(totalOrders),'Soma dos pedidos registrados')}${metric('Receitas lançadas',money(revenue),'Todos os lançamentos de receita')}${metric('Despesas lançadas',money(expenses),'Todos os lançamentos de despesa')}${metric('Resultado financeiro',money(revenue-expenses),'Receitas menos despesas')}${metric('Pedidos registrados',o.data.length,'Todos os status')}${metric('Ticket médio',money(o.data.length?totalOrders/o.data.length:0),'Valor médio por pedido')}${metric('Produtos ativos',p.data.filter(x=>x.active).length,'Itens disponíveis')}${metric('Produtos críticos',low.length,'Estoque de até 5 unidades')}</div><div class="report-grid"><section class="card panel-section"><span class="eyebrow">EXPORTAÇÃO DE DADOS</span><h2>Baixe relatórios</h2><p class="muted">Escolha a base e o formato de exportação.</p><div class="export-list">${[['orders','Relatório de pedidos','Pedidos, clientes, valores e status'],['products','Relatório de produtos e estoque','Preço, categoria, SKU e saldo'],['finance','Relatório financeiro','Receitas, despesas e categorias'],['shipments','Relatório de expedição','Remessas, destinatários e status']].map(([key,title,desc])=>`<div class="export-row"><div><b>${title}</b><small>${desc}</small></div><div class="export-formats"><button class="btn secondary" data-export="${key}" data-format="json">JSON</button><button class="btn secondary" data-export="${key}" data-format="xls">XLS</button><button class="btn secondary" data-export="${key}" data-format="pdf">PDF</button><button class="btn secondary" data-export="${key}" data-format="csv">CSV</button></div></div>`).join('')}</div></section><section class="card panel-section"><span class="eyebrow">PONTOS DE ATENÇÃO</span><h2>Saúde do catálogo</h2>${low.length?low.slice(0,8).map(x=>`<div class="alert-item"><span class="alert-symbol">!</span><div><b>${escapeHtml(x.name)}</b><small>${x.stock_quantity} unidade(s) disponíveis</small></div></div>`).join(''):'<div class="empty-state">Nenhum alerta de estoque no momento.</div>'}</section></div>`;
 const datasets={orders:o.data.map(x=>({pedido:x.id,cliente:x.profiles?.full_name||x.profiles?.email||'',data:x.created_at,status:x.status,modalidade:x.order_type,total:x.total})),products:p.data,finance:t.data,shipments:s.data.map(x=>({remessa:x.id,revendedor:x.profiles?.full_name||'',data:x.shipment_date,status:x.status,descricao:x.description}))};
 const names={orders:'Pedidos',products:'Produtos e estoque',finance:'Financeiro',shipments:'Expedição'};
 $('#content').querySelectorAll('[data-export][data-format]').forEach(b=>b.onclick=()=>exportReport(`dopamina3d-${b.dataset.export}-${new Date().toISOString().slice(0,10)}`,names[b.dataset.export],datasets[b.dataset.export],b.dataset.format));
}
function exportReport(baseName,title,rows,format){
 if(!rows?.length){toast('Não há dados para exportar.');return;}
 const filename=`${baseName}.${format}`;
 if(format==='json'){
  const blob=new Blob([JSON.stringify({empresa:'Dopamina 3D',relatorio:title,gerado_em:new Date().toISOString(),quantidade:rows.length,dados:rows},null,2)],{type:'application/json;charset=utf-8'});downloadBlob(filename,blob);return;
 }
 if(format==='csv'){downloadCSV(filename,rows);return;}
 const headers=[...new Set(rows.flatMap(x=>Object.keys(x)))];
 const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
 const table=`<table><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${headers.map(h=>`<td>${esc(typeof row[h]==='object'?JSON.stringify(row[h]):row[h])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
 if(format==='xls'){
  const html=`<!doctype html><html><head><meta charset="utf-8"></head><body><h2>${esc(title)} — Dopamina 3D</h2><p>Gerado em ${new Date().toLocaleString('pt-BR')}</p>${table}</body></html>`;
  downloadBlob(filename,new Blob(['\ufeff',html],{type:'application/vnd.ms-excel;charset=utf-8;'}));return;
 }
 if(format==='pdf'){
  const win=window.open('about:blank','_blank');
  if(!win){toast('Permita pop-ups para gerar o PDF.');return;}
  win.document.open();win.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(title)} - Dopamina 3D</title><style>body{font:12px Arial,sans-serif;color:#171512;padding:28px}header{border-bottom:5px solid #c6f432;padding-bottom:14px;margin-bottom:20px}h1{font-size:22px;margin:0 0 6px}p{color:#555}table{width:100%;border-collapse:collapse;font-size:10px}th{background:#171512;color:#fff;text-align:left}th,td{padding:7px;border:1px solid #ddd;overflow-wrap:anywhere}tr:nth-child(even){background:#f4f1ea}.brand{font-weight:bold;letter-spacing:2px;color:#171512}@media print{body{padding:8mm}button{display:none}}</style></head><body><header><div class="brand">DOPAMINA 3D</div><h1>${esc(title)}</h1><p>Gerado em ${new Date().toLocaleString('pt-BR')} · ${rows.length} registro(s)</p></header>${table}<script>window.onload=()=>setTimeout(()=>window.print(),250);</script></body></html>`);win.document.close();return;
 }
 toast('Formato de exportação não reconhecido.');
}
function downloadBlob(filename,blob){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Relatório exportado.');}
function downloadCSV(filename,rows){if(!rows?.length){toast('Não há dados para exportar.');return;}const headers=[...new Set(rows.flatMap(x=>Object.keys(x)))],cell=v=>`"${String(v??'').replace(/"/g,'""')}"`,csv='\ufeff'+[headers.map(cell).join(';'),...rows.map(r=>headers.map(h=>cell(r[h])).join(';'))].join('\r\n'),blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});downloadBlob(filename,blob);}
async function customerDashboard(){
 const {data:d,error}=await sb.from('customer_profiles').select('*').eq('user_id',profile.id).maybeSingle();if(error)throw error;
 if(!d){$('#content').innerHTML='<div class="card alert">Não encontramos seus dados cadastrais. Entre em contato com a Dopamina 3D.</div>';return;}
 const fields=[['Telefone / WhatsApp',d.phone],['CPF',d.document_number],['CEP',d.postal_code],['Endereço',[d.street,d.address_number,d.complement].filter(Boolean).join(', ')],['Bairro',d.neighborhood],['Cidade / UF',[d.city,d.state].filter(Boolean).join(' / ')],['Referência',d.reference]];
 $('#content').innerHTML=`<div class="card"><h2>Bem-vindo(a), ${escapeHtml(profile.full_name||'cliente')}!</h2><p class="muted">Seu cadastro de cliente está ativo. Para solicitar uma peça ou tirar dúvidas, utilize nossos canais de atendimento.</p><div class="section"><h2>Seus dados cadastrais</h2><div class="grid">${fields.filter(x=>x[1]).map(x=>`<div><small class="muted">${x[0]}</small><p>${escapeHtml(x[1])}</p></div>`).join('')}</div></div><div class="actions"><a class="btn secondary" href="index.html">Ver catálogo</a></div></div>`;
}
function metric(label,value,sub){return `<div class="card metric"><small>${label}</small><strong>${value}</strong><em>${sub}</em></div>`}
async function catalog(){
 const {data,error}=await sb.from('products').select('*').order('name');if(error)throw error;window.__dopaminaProductCategories=[...new Set((data||[]).map(p=>p.category).filter(Boolean))];
 const internal=profile.role==='admin'&&data.length?await sb.from('product_internal_data').select('product_id,cost_price').in('product_id',data.map(x=>x.id)):({data:[]});if(internal.error)throw internal.error;
 const costs=new Map((internal.data||[]).map(x=>[x.product_id,Number(x.cost_price||0)]));
 const rows=(data||[]).map(p=>{const cost=costs.get(p.id)||0,margin=Number(p.price||0)-cost;return `<tr data-product-row="${p.id}"><td><b>${escapeHtml(p.name)}</b><br><small class="muted">${escapeHtml(p.sku||'')}</small></td><td>${money(p.price)}</td><td><b>${money(p.wholesale_price??p.price)}</b></td>${profile.role==='admin'?`<td>${money(cost)}</td><td><b>${money(margin)}</b></td>`:''}<td><div class="stock-edit"><input aria-label="Estoque de ${escapeHtml(p.name)}" type="number" min="0" step="1" value="${Math.max(0,Number(p.stock_quantity)||0)}" data-stock-input="${p.id}"><button type="button" class="icon-save-btn stock-save" data-stock-save="${p.id}" aria-label="Salvar estoque" title="Salvar estoque"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h12l4 4v14H3V3h2Z"/><path d="M7 3v6h10V3M7 21v-7h10v7M9 17h6"/></svg></button></div><small class="muted">${Number(p.stock_quantity||0)<=5?'Estoque baixo':'Em estoque'}</small></td><td>${escapeHtml((p.colors||[]).join(', ')||'—')}</td><td><span class="status ${p.active?'ok':'bad'}">${p.active?'Ativa':'Inativa'}</span></td><td><button type="button" class="product-status-toggle ${(p.show_on_homepage!==false)?'is-active':'is-inactive'}" data-toggle-catalog-visibility="${p.id}" data-next-visible="${p.show_on_homepage===false?'true':'false'}">${p.show_on_homepage===false?'Oculto':'Publicado'}</button></td><td><div class="product-row-actions"><button class="btn secondary" data-edit="${p.id}">Editar</button><button type="button" class="product-status-toggle ${p.active?'is-active':'is-inactive'}" data-toggle-product-active="${p.id}" data-next-active="${p.active?'false':'true'}" aria-label="${p.active?'Desativar':'Ativar'} ${escapeHtml(p.name)}">${p.active?'Desativar':'Ativar'}</button></div></td></tr>`}).join('');
 const low=(data||[]).filter(p=>Number(p.stock_quantity||0)<=5).length;
 $('#content').innerHTML=`<div class="grid">${metric('Produtos cadastrados',data.length,'Ativos e inativos')}${metric('Produtos ativos',data.filter(p=>p.active).length,'Disponíveis no catálogo')}${metric('Estoque baixo',low,'Até 5 unidades')}${metric('Unidades em estoque',(data||[]).reduce((a,p)=>a+Math.max(0,Number(p.stock_quantity)||0),0),'Soma das quantidades cadastradas')}</div><div class="card section"><div class="row between"><div><h2>Produtos e controle de estoque</h2><span class="muted">Atualize quantidades diretamente na tabela ou edite os dados completos do produto.</span></div><button class="btn" id="addProduct">+ Novo produto</button></div><div class="row" style="margin:14px 0"><input id="productSearch" placeholder="Buscar por nome ou SKU..." style="max-width:320px"><select id="stockFilter" style="max-width:200px"><option value="all">Todos os produtos</option><option value="low">Estoque baixo (até 5)</option><option value="zero">Sem estoque</option><option value="active">Somente ativos</option><option value="inactive">Somente inativos</option></select></div><div class="table-wrap"><table class="table"><thead><tr><th>Produto</th><th>Varejo</th><th>Atacado</th>${profile.role==='admin'?'<th>Custo</th><th>Margem</th>':''}<th>Estoque (un.)</th><th>Cores</th><th>Disponibilidade</th><th>Vitrine</th><th>Ações</th></tr></thead><tbody>${rows||`<tr><td colspan="${profile.role==='admin'?10:8}" class="empty">Nenhum produto cadastrado.</td></tr>`}</tbody></table></div></div><div id="productForm" class="card section hidden"></div>`;
 $('#addProduct').onclick=()=>{ $('#content').querySelectorAll('.inline-product-editor').forEach(el=>el.remove()); editProduct(); requestAnimationFrame(()=>requestAnimationFrame(()=>$('#productForm')?.scrollIntoView({behavior:'smooth',block:'start'}))); };
 $('#content').querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{
  const baseProduct=data.find(x=>x.id===b.dataset.edit),product=baseProduct?{...baseProduct,cost_price:costs.has(baseProduct.id)?costs.get(baseProduct.id):0}:null,row=b.closest('tr');
  $('#content').querySelectorAll('.inline-product-editor').forEach(el=>el.remove());
  const inline=document.createElement('tr');inline.className='inline-product-editor';inline.innerHTML=`<td colspan="${profile.role==='admin'?10:8}"><div id="productForm" class="card inline-product-card"></div></td>`;
  row.after(inline);editProduct(product,true);inline.scrollIntoView({behavior:'smooth',block:'nearest'});
 });

 $('#content').querySelectorAll('[data-toggle-product-active]').forEach(b=>b.onclick=async()=>{
  const product=data.find(x=>x.id===b.dataset.toggleProductActive);if(!product)return;
  const next=b.dataset.nextActive==='true';
  const actionLabel=next?'ativar':'desativar';
  if(!confirm(`Deseja ${actionLabel} o produto “${product.name}”? ${next?'Ele voltará a aparecer no catálogo.':'Ele deixará de aparecer no catálogo, mas será mantido no estoque e no histórico.'}`))return;
  b.disabled=true;
  try{
   await productAdminRequest({action:'set_product_active',product_id:product.id,active:next});
   toast(next?'Produto ativado no catálogo.':'Produto desativado no catálogo.');
   await catalog();
  }catch(err){toast('Não foi possível alterar a situação: '+(err.message||err));b.disabled=false;}
 });
 $('#content').querySelectorAll('[data-toggle-catalog-visibility]').forEach(b=>b.onclick=async()=>{
  const product=data.find(x=>x.id===b.dataset.toggleCatalogVisibility);if(!product)return;
  const visible=b.dataset.nextVisible==='true';b.disabled=true;
  try{await productAdminRequest({action:'set_catalog_visibility',product_id:product.id,show_on_homepage:visible});toast(visible?'Produto publicado na vitrine.':'Produto retirado da vitrine.');await catalog();}
  catch(err){toast('Não foi possível alterar a vitrine: '+(err.message||err));b.disabled=false;}
 });
 const applyFilter=()=>{const q=$('#productSearch').value.trim().toLocaleLowerCase('pt-BR'),f=$('#stockFilter').value;$('#content').querySelectorAll('[data-product-row]').forEach(tr=>{const item=data.find(x=>x.id===tr.dataset.productRow);const matches=(!q||`${item.name} ${item.sku||''}`.toLocaleLowerCase('pt-BR').includes(q))&&(f==='all'||(f==='low'&&Number(item.stock_quantity||0)<=5)||(f==='zero'&&Number(item.stock_quantity||0)===0)||(f==='active'&&item.active)||(f==='inactive'&&!item.active));tr.hidden=!matches;});};
 $('#productSearch').oninput=applyFilter;$('#stockFilter').onchange=applyFilter;
 $('#content').querySelectorAll('[data-stock-save]').forEach(b=>b.onclick=async()=>{const id=b.dataset.stockSave,input=$(`[data-stock-input="${id}"]`),qty=Number(input.value);if(!Number.isInteger(qty)||qty<0){toast('Informe uma quantidade inteira igual ou maior que zero.');return;}b.disabled=true;try{await productAdminRequest({action:'update_stock',product_id:id,stock_quantity:qty});toast('Estoque atualizado com sucesso.');await catalog();}catch(err){toast('Falha ao atualizar estoque: '+(err.message||err));b.disabled=false;}});
}
function productDraftKey(productId){
 return `dopamina3d:product-draft:${profile?.id||'local'}:${productId||'new'}`;
}
function readProductDraft(productId){
 try{return JSON.parse(localStorage.getItem(productDraftKey(productId))||'null');}
 catch(_){return null;}
}
function writeProductDraft(form,productId){
 const data={};
 new FormData(form).forEach((value,key)=>{if(key!=='image_file'&&!(value instanceof File))data[key]=value;});
 form.querySelectorAll('input[type=checkbox][name]').forEach(el=>data[el.name]=el.checked);
 data.savedAt=new Date().toISOString();
 try{localStorage.setItem(productDraftKey(productId),JSON.stringify(data));return true;}
 catch(_){return false;}
}
function applyProductDraft(form,draft){
 if(!draft)return;
 Object.entries(draft).forEach(([key,value])=>{
  const field=form.elements.namedItem(key);
  if(!field||key==='savedAt')return;
  if(field.type==='checkbox')field.checked=Boolean(value);
  else field.value=value??'';
 });
}
function clearProductDraft(productId){
 try{localStorage.removeItem(productDraftKey(productId));}catch(_){}
}
function editProduct(p={},inline=false){
 const f=$('#productForm'),draftKey=productDraftKey(p.id||null),draft=readProductDraft(p.id||null);
 f.classList.remove('hidden');
 f.innerHTML=`<h2>${p.id?'Editar produto':'Cadastrar produto'}</h2><form id="pf" class="form-grid"><div class="field"><label>Nome</label><input name="name" required value="${escapeHtml(p.name||'')}"></div><div class="field"><label>SKU / Código interno</label><input name="sku" value="${escapeHtml(p.sku||'')}"></div><div class="field"><label>Categoria</label><input name="category" list="productCategoryOptions" autocomplete="off" placeholder="Selecione ou digite uma categoria" value="${escapeHtml(p.category||'Geral')}"><datalist id="productCategoryOptions">${[...new Set((window.__dopaminaProductCategories||[]).map(x=>String(x||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR')).map(x=>`<option value="${escapeHtml(x)}"></option>`).join('')}</datalist><small class="muted">Selecione uma categoria existente ou digite uma nova. A nova opção ficará disponível após salvar o produto.</small></div><div class="field full image-upload-field"><label>Imagem do produto</label><div class="image-upload-row"><div class="image-preview" id="productImagePreview">${p.image_url?`<img src="${escapeHtml(p.image_url)}" alt="Prévia do produto">`:'<span>Prévia da imagem</span>'}</div><div class="image-upload-controls"><input name="image_file" type="file" accept="image/png,image/jpeg,image/webp,image/gif"><small class="muted">PNG, JPG, WebP ou GIF · até 8 MB. O envio será feito ao Storage do Supabase.</small><label for="image_url">Ou informe uma URL existente</label><input id="image_url" name="image_url" type="url" value="${escapeHtml(p.image_url||'')}" placeholder="https://..."></div></div></div><div class="field"><label>Preço de varejo (R$)</label><input name="price" type="number" min="0" step=".01" required value="${p.price??''}"></div><div class="field"><label>Preço de atacado (R$)</label><input name="wholesale_price" type="number" min="0" step=".01" required value="${p.wholesale_price??p.price??''}"><small class="muted">Valor praticado nas modalidades de compra e consignação dos revendedores.</small></div>${profile.role==='admin'?`<div class="field"><label>Custo unitário (R$)</label><input name="cost_price" type="number" min="0" step=".01" value="${p.cost_price??0}"></div>`:''}<div class="field"><label>Estoque atual (unidades)</label><input name="stock_quantity" type="number" min="0" step="1" value="${p.stock_quantity??0}" required></div><div class="field"><label>Cores disponíveis (separe por vírgula)</label><input name="colors" value="${escapeHtml((p.colors||[]).join(', '))}"></div><div class="field full"><label>Descrição</label><textarea name="description">${escapeHtml(p.description||'')}</textarea></div><div class="field full"><label>Informações adicionais exibidas na vitrine</label><textarea name="catalog_details" placeholder="Ex.: dimensões, material, opções de personalização, observações comerciais...">${escapeHtml(p.catalog_details||'')}</textarea><small class="muted">Estas informações serão exibidas publicamente junto à descrição.</small></div><div class="field"><label><input type="checkbox" name="show_on_homepage" ${p.show_on_homepage!==false?'checked':''}> Exibir na página inicial</label><small class="muted">Novos produtos ativos começam publicados. Você pode retirar individualmente.</small></div><div class="field"><label>Ordem de exibição</label><input name="catalog_order" type="number" step="1" min="0" value="${Number(p.catalog_order)||0}"><small class="muted">Menor número aparece primeiro.</small></div><div class="field"><label><input type="checkbox" name="catalog_featured" ${p.catalog_featured?'checked':''}> Destacar produto na vitrine</label></div><div class="field full"><small class="muted">Situação no catálogo: <strong>${p.active===false?'Inativo':'Ativo'}</strong>. Para ativar ou desativar, use o botão correspondente na linha do produto.</small></div><div class="field full"><small id="productDraftStatus" class="muted">As alterações são salvas automaticamente neste navegador.</small></div><div class="field full actions">${saveIconButton("Salvar produto")}<button class="btn secondary" type="button" id="cancelPF">Cancelar</button></div></form>`;
 const form=$('#pf'),status=$('#productDraftStatus');
 const imageInput=form.elements.image_file,imagePreview=$('#productImagePreview');
 imageInput?.addEventListener('change',()=>{
  const file=imageInput.files?.[0];if(!file)return;
  if(!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type)||file.size>8*1024*1024){toast('Escolha PNG, JPG, WebP ou GIF de até 8 MB.');imageInput.value='';return;}
  const localUrl=URL.createObjectURL(file);imagePreview.innerHTML=`<img src="${localUrl}" alt="Prévia da imagem selecionada">`;
 });
 if(draft){
  applyProductDraft(form,draft);
  // Rascunhos antigos podiam ter gravado custo=0 porque o custo salvo não era carregado no editor.
  // Nesse caso, o valor persistido no banco prevalece; se ainda não havia custo, permanece R$ 0,00.
  const costField=form.elements.cost_price,savedCost=Number(p.cost_price??0),draftCost=Number(draft.cost_price);
  if(costField&&savedCost>0&&(!Number.isFinite(draftCost)||draftCost===0))costField.value=String(savedCost);
  status.textContent='Rascunho recuperado automaticamente. Continue de onde parou.';
 }
 let draftTimer;
 const persistDraft=()=>{
  clearTimeout(draftTimer);
  draftTimer=setTimeout(()=>{
   const ok=writeProductDraft(form,p.id||null);
   status.textContent=ok?'Rascunho salvo automaticamente neste navegador.':'Não foi possível salvar o rascunho neste navegador.';
  },250);
 };
 form.addEventListener('input',persistDraft);
 form.addEventListener('change',persistDraft);
 $('#cancelPF').onclick=()=>{
  if(!confirm('Cancelar e descartar as alterações deste produto?'))return;
  clearTimeout(draftTimer);clearProductDraft(p.id||null);if(inline)f.closest('.inline-product-editor')?.remove();else f.classList.add('hidden');
 };
 form.onsubmit=async e=>{
  e.preventDefault();clearTimeout(draftTimer);
  const d=new FormData(e.target),qty=Number(d.get('stock_quantity'));
  if(!Number.isInteger(qty)||qty<0){toast('Estoque deve ser um número inteiro não negativo.');return;}
  writeProductDraft(form,p.id||null);
  let imageUrl=d.get('image_url')||null;
  const imageFile=d.get('image_file');
  if(imageFile&&imageFile.size){
   if(!['image/png','image/jpeg','image/webp','image/gif'].includes(imageFile.type)||imageFile.size>8*1024*1024){toast('A imagem deve ser PNG, JPG, WebP ou GIF de até 8 MB.');return;}
  }
  const payload={name:d.get('name').trim(),sku:d.get('sku').trim()||null,category:d.get('category')||'Geral',image_url:imageUrl,price:Number(d.get('price')),wholesale_price:Number(d.get('wholesale_price')),stock_quantity:qty,colors:d.get('colors').split(',').map(x=>x.trim()).filter(Boolean),description:d.get('description'),catalog_details:d.get('catalog_details'),show_on_homepage:form.elements.show_on_homepage.checked,catalog_order:Math.max(0,Math.trunc(Number(d.get('catalog_order')||0))),catalog_featured:form.elements.catalog_featured.checked,active:p.active!==false};
  const btn=e.target.querySelector('button[type="submit"]');btn.disabled=true;
  let uploadedImagePath=null;
  try{
   if(imageFile&&imageFile.size){
    const ext=({ 'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif'})[imageFile.type];
    const key=`products/${crypto.randomUUID()}.${ext}`;
    const upload=await sb.storage.from('product-images').upload(key,imageFile,{upsert:false,contentType:imageFile.type,cacheControl:'31536000'});
    if(upload.error)throw upload.error;uploadedImagePath=key;
    const publicResult=sb.storage.from('product-images').getPublicUrl(key);
    imageUrl=publicResult.data?.publicUrl;
    if(!imageUrl)throw new Error('Não foi possível gerar a URL pública da imagem.');
    payload.image_url=imageUrl;
   }
   const result=await productAdminRequest({action:'save_product',product_id:p.id||null,product:payload,cost_price:profile.role==='admin'?Number(d.get('cost_price')||0):null});
   if(!result?.product_id)throw new Error('O servidor não confirmou o salvamento do produto.');
   clearProductDraft(p.id||null);toast('Produto salvo com sucesso.');await catalog();
  }catch(err){if(uploadedImagePath){const cleanup=await sb.storage.from('product-images').remove([uploadedImagePath]);if(cleanup.error)console.warn('Falha ao limpar imagem órfã:',cleanup.error);}toast('Não foi possível salvar: '+err.message);btn.disabled=false;status.textContent='Não foi possível concluir. O rascunho foi mantido para você tentar novamente.';}
 };
}
// Abre arquivos privados sem navegar diretamente para a URL assinada do Supabase.
// A URL temporária é usada apenas para buscar o conteúdo; a aba recebe um blob: URL.
async function openPrivateStorageFile(bucket,path){
 if(!path){toast('Arquivo não encontrado.');return;}
 const viewer=window.open('about:blank','_blank');
 if(!viewer){toast('Permita pop-ups para visualizar o documento.');return;}
 try{
  viewer.opener=null;
  viewer.document.title='Abrindo documento — Dopamina 3D';
  viewer.document.body.innerHTML='<p style="font:14px Arial,sans-serif;padding:24px;color:#625D55">Preparando documento com segurança…</p>';
  const {data,error}=await sb.storage.from(bucket).createSignedUrl(path,60);
  if(error)throw error;
  if(!data?.signedUrl)throw new Error('O Supabase não retornou um link temporário.');
  const response=await fetch(data.signedUrl,{method:'GET',cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});
  if(!response.ok)throw new Error('Não foi possível baixar o documento ('+response.status+').');
  const blob=await response.blob();
  if(!blob.size)throw new Error('O arquivo está vazio.');
  const objectUrl=URL.createObjectURL(blob);
  viewer.location.replace(objectUrl);
  // Mantém o Blob disponível durante a leitura no visualizador PDF do navegador.
  window.setTimeout(()=>URL.revokeObjectURL(objectUrl),10*60*1000);
 }catch(err){
  try{viewer.close();}catch(_){}
  toast('Falha ao abrir arquivo: '+(err?.message||'erro inesperado'));
 }
}
function confirmDelete(message='Esta ação não poderá ser desfeita.',title='Excluir?',confirmLabel='Sim, excluir'){
 return new Promise(resolve=>{
  let modal=document.getElementById('deleteConfirmModal');
  if(!modal){
   modal=document.createElement('div');modal.id='deleteConfirmModal';modal.className='confirm-modal hidden';
   modal.innerHTML=`<div class="confirm-modal-backdrop" data-confirm-close></div><section class="confirm-modal-card" role="dialog" aria-modal="true" aria-labelledby="confirmDeleteTitle"><button type="button" class="confirm-modal-x" data-confirm-close aria-label="Fechar">×</button><span class="confirm-modal-icon">!</span><h2 id="confirmDeleteTitle">Excluir?</h2><p class="confirm-modal-copy"></p><label class="confirm-modal-check"><input type="checkbox" id="confirmDeleteCheck"><span>Estou ciente e desejo continuar.</span></label><div class="confirm-modal-actions"><button type="button" class="btn secondary" data-confirm-no>Não</button><button type="button" class="btn danger" id="confirmDeleteYes" disabled>Sim, excluir</button></div></section>`;
   document.body.append(modal);
  }
  modal.querySelector('.confirm-modal-copy').textContent=message;
  modal.querySelector('#confirmDeleteTitle').textContent=title;
  modal.querySelector('#confirmDeleteYes').textContent=confirmLabel;
  const check=modal.querySelector('#confirmDeleteCheck'),yes=modal.querySelector('#confirmDeleteYes');
  check.checked=false;yes.disabled=true;modal.classList.remove('hidden');
  const finish=value=>{modal.classList.add('hidden');check.removeEventListener('change',onChange);yes.removeEventListener('click',onYes);modal.querySelectorAll('[data-confirm-close],[data-confirm-no]').forEach(el=>el.removeEventListener('click',onNo));document.removeEventListener('keydown',onKey);resolve(value);};
  const onChange=()=>yes.disabled=!check.checked,onYes=()=>finish(true),onNo=()=>finish(false),onKey=e=>{if(e.key==='Escape')finish(false)};
  check.addEventListener('change',onChange);yes.addEventListener('click',onYes);modal.querySelectorAll('[data-confirm-close],[data-confirm-no]').forEach(el=>el.addEventListener('click',onNo));document.addEventListener('keydown',onKey);
 });
}
const financeDraftKey=()=>`dopamina3d:finance-draft:${profile?.id||'anonymous'}`;
const financeBlobKey=()=>`dopamina3d:finance-file:${profile?.id||'anonymous'}`;
function openLocalDraftDB(){
 return new Promise((resolve,reject)=>{
  if(!('indexedDB' in window)){reject(new Error('Armazenamento local indisponível'));return;}
  const req=indexedDB.open('dopamina3d-local-drafts',1);
  req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('files'))req.result.createObjectStore('files',{keyPath:'key'});};
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
 });
}
async function storeFinanceBlob(file){
 const db=await openLocalDraftDB();
 await new Promise((resolve,reject)=>{const tx=db.transaction('files','readwrite');tx.objectStore('files').put({key:financeBlobKey(),blob:file,name:file.name,type:file.type,lastModified:file.lastModified||Date.now()});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
 db.close();
}
async function readFinanceBlob(){
 const db=await openLocalDraftDB();
 const result=await new Promise((resolve,reject)=>{const tx=db.transaction('files','readonly'),req=tx.objectStore('files').get(financeBlobKey());req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error);});
 db.close();if(!result?.blob)return null;
 return new File([result.blob],result.name||'comprovante', {type:result.type||result.blob.type,lastModified:result.lastModified||Date.now()});
}
async function clearFinanceBlob(){
 try{const db=await openLocalDraftDB();await new Promise((resolve,reject)=>{const tx=db.transaction('files','readwrite');tx.objectStore('files').delete(financeBlobKey());tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();}catch(e){console.warn('Não foi possível limpar o arquivo temporário:',e);}
}
function readFinanceDraft(){try{return JSON.parse(sessionStorage.getItem(financeDraftKey())||'null');}catch(e){return null;}}
function writeFinanceDraft(form,x,extra={}){
 const d=new FormData(form);
 const draft={id:x?.id||null,attachment_path:x?.attachment_path||null,fields:{type:d.get('type'),amount:d.get('amount'),date:d.get('date'),category:d.get('category'),description:d.get('description')},...extra,updatedAt:Date.now()};
 try{sessionStorage.setItem(financeDraftKey(),JSON.stringify(draft));}catch(e){console.warn('Não foi possível salvar o rascunho financeiro:',e);}
}
function clearFinanceDraft(){try{sessionStorage.removeItem(financeDraftKey());}catch(e){}clearFinanceBlob();}
function restoreFinanceFields(form,draft){
 if(!draft?.fields)return;
 for(const [name,value] of Object.entries(draft.fields)){const el=form.elements.namedItem(name);if(el&&value!=null)el.value=value;}
}
async function finance(){
 if(profile.role!=='admin')throw new Error('Acesso restrito ao administrador.');
 const {data:allData,error}=await sb.from('financial_transactions').select('*').order('date',{ascending:false});if(error)throw error;
 const data=allData.filter(x=>(!window.financeFrom||x.date>=window.financeFrom)&&(!window.financeTo||x.date<=window.financeTo));
 const inc=data.filter(x=>x.type==='income').reduce((a,x)=>a+Number(x.amount),0),out=data.filter(x=>x.type==='expense').reduce((a,x)=>a+Number(x.amount),0);
 const months=[];const now=new Date();for(let i=5;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);const key=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');const list=data.filter(x=>(x.competence_month||x.date?.slice(0,7))===key);months.push({label:d.toLocaleDateString('pt-BR',{month:'short'}).replace('.',''),income:list.filter(x=>x.type==='income').reduce((a,x)=>a+Number(x.amount),0),expense:list.filter(x=>x.type==='expense').reduce((a,x)=>a+Number(x.amount),0)});}
 const max=Math.max(1,...months.flatMap(m=>[m.income,m.expense]));
 const chart=`<div class="card section"><div class="row between"><div><h2>Movimentação dos últimos 6 meses</h2><span class="muted">Comparativo mensal de receitas e despesas</span></div><div class="row"><span class="status ok">● Receitas</span><span class="status bad">● Despesas</span></div></div><div style="display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px;align-items:end;height:210px;padding:18px 4px 0">${months.map(m=>`<div style="height:100%;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:7px"><div style="height:155px;width:100%;display:flex;align-items:flex-end;justify-content:center;gap:5px;border-bottom:1px solid var(--line)"><div title="Receitas: ${money(m.income)}" style="height:${Math.max(m.income?3:0,m.income/max*145)}px;width:min(34%,30px);background:#16834a;border-radius:5px 5px 0 0"></div><div title="Despesas: ${money(m.expense)}" style="height:${Math.max(m.expense?3:0,m.expense/max*145)}px;width:min(34%,30px);background:#bd3434;border-radius:5px 5px 0 0"></div></div><small class="muted">${escapeHtml(m.label)}</small></div>`).join('')}</div><div class="muted" style="font-size:11px">Valores em R$. Passe o cursor sobre as barras para consultar os valores.</div></div>`;
 const rows=data.map(x=>`<tr data-finance-row="${x.id}"><td>${date(x.date)}</td><td><span class="status ${x.type==='income'?'ok':'bad'}">${x.type==='income'?'Receita':'Despesa'}</span></td><td>${escapeHtml(x.category||'—')}</td><td>${escapeHtml(x.description)}</td><td>${money(x.amount)}</td><td>${x.attachment_path?`<div class="finance-file-actions"><button type="button" class="btn secondary finance-open-btn" data-file="${escapeHtml(x.attachment_path)}" aria-label="Comprovante" title="Comprovante"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3h7v7M10 14 21 3M19 13v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h7"/></svg><span>Abrir</span></button>${deleteIconButton(`data-remove-file="${x.id}"`,'Excluir anexo')}</div>`:'—'}</td><td><div class="finance-row-actions"><button class="btn secondary" data-tx="${x.id}">Editar</button>${deleteIconButton(`data-delete-tx="${x.id}"`,'Excluir lançamento')}</div></td></tr>`).join('');
 $('#content').innerHTML=`<div class="grid">${metric('Receitas registradas',money(inc),'Total do período carregado')}${metric('Despesas registradas',money(out),'Total do período carregado')}${metric('Saldo',money(inc-out),'Receitas menos despesas')}${metric('Lançamentos',data.length,'Receitas e despesas')}</div>${chart}<div class="section card"><div class="row between"><div><h2>Lançamentos financeiros</h2><span class="muted">Registre entradas, saídas, datas, observações e comprovantes.</span></div><div class="actions"><button class="btn secondary" id="exportFinance">Exportar CSV</button><button class="btn" id="addTx">+ Novo lançamento</button></div></div><div class="row" style="margin:14px 0"><label class="field">De <input id="financeFrom" type="date" value="${window.financeFrom||''}"></label><label class="field">Até <input id="financeTo" type="date" value="${window.financeTo||''}"></label><button class="btn secondary" id="clearFinanceFilter">Limpar período</button></div><div class="table-wrap"><table class="table"><thead><tr><th>Data</th><th>Tipo</th><th>Categoria</th><th>Descrição</th><th>Valor</th><th>Comprovante</th><th>Ações</th></tr></thead><tbody>${rows||'<tr><td colspan="7" class="empty">Nenhum lançamento encontrado.</td></tr>'}</tbody></table></div></div><div id="txForm" class="card section hidden"></div>`;
 $('#addTx').onclick=()=>{editTx();requestAnimationFrame(()=>$('#txForm')?.scrollIntoView({behavior:'smooth',block:'center'}));};
 $('#financeFrom').onchange=e=>{window.financeFrom=e.target.value;finance();};$('#financeTo').onchange=e=>{window.financeTo=e.target.value;finance();};$('#clearFinanceFilter').onclick=()=>{window.financeFrom='';window.financeTo='';finance();};
 $('#exportFinance').onclick=()=>{const cols=['Data','Tipo','Categoria','Descrição','Valor'];const csv=[cols,...data.map(x=>[x.date,x.type==='income'?'Receita':'Despesa',x.category||'',x.description,Number(x.amount).toFixed(2)])].map(row=>row.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(';')).join('\r\n');const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='dopamina3d-financeiro.csv';a.click();URL.revokeObjectURL(url);};
 $('#content').querySelectorAll('[data-tx]').forEach(b=>b.onclick=()=>{
  const tx=data.find(x=>x.id===b.dataset.tx),row=b.closest('tr');
  $('#content').querySelectorAll('.inline-finance-editor').forEach(el=>el.remove());
  const inline=document.createElement('tr');inline.className='inline-finance-editor';
  inline.innerHTML='<td colspan="7"><div id="txFormInline" class="card section inline-finance-card"></div></td>';
  row.after(inline);editTx(tx,true);inline.scrollIntoView({behavior:'smooth',block:'nearest'});
 });
 $('#content').querySelectorAll('[data-file]').forEach(a=>a.onclick=async e=>{e.preventDefault();await openPrivateStorageFile('finance-files',a.dataset.file);});
 $('#content').querySelectorAll('[data-remove-file]').forEach(b=>b.onclick=async()=>{const tx=data.find(x=>x.id===b.dataset.removeFile);if(!tx?.attachment_path)return;if(!await confirmDelete('Esta ação não poderá ser desfeita. O lançamento financeiro será mantido.'))return;const del=await sb.storage.from('finance-files').remove([tx.attachment_path]);if(del.error){toast('Não foi possível excluir o arquivo: '+del.error.message);return;}const upd=await sb.from('financial_transactions').update({attachment_path:null}).eq('id',tx.id);if(upd.error){toast('Arquivo removido, mas não foi possível atualizar o lançamento: '+upd.error.message);return;}toast('Anexo excluído.');finance();});
 $('#content').querySelectorAll('[data-delete-tx]').forEach(b=>b.onclick=async()=>{const tx=data.find(x=>x.id===b.dataset.deleteTx);if(!tx)return;if(!await confirmDelete(`Excluir o lançamento "${tx.description}" de ${money(tx.amount)}? Esta ação não poderá ser desfeita.`))return;const del=await sb.from('financial_transactions').delete().eq('id',tx.id);if(del.error){toast('Não foi possível excluir: '+del.error.message);return;}if(tx.attachment_path){const fileDel=await sb.storage.from('finance-files').remove([tx.attachment_path]);if(fileDel.error)toast('Lançamento excluído; houve falha ao remover o arquivo: '+fileDel.error.message);else toast('Lançamento e anexo excluídos.');}else toast('Lançamento excluído.');finance();});
 const savedDraft=readFinanceDraft();
 if(savedDraft && Date.now()-(savedDraft.updatedAt||0)<24*60*60*1000){
  const tx=savedDraft.id?data.find(item=>item.id===savedDraft.id):null;
  if(!savedDraft.id || tx){
   if(tx){
    const row=$(`#content tr[data-finance-row="${tx.id}"]`);
    if(row){const inline=document.createElement('tr');inline.className='inline-finance-editor';inline.innerHTML='<td colspan="7"><div id="txFormInline" class="card section inline-finance-card"></div></td>';row.after(inline);editTx(tx,true,savedDraft);}
   }else editTx({},false,savedDraft);
  }
 }else if(savedDraft){clearFinanceDraft();}
}
function editTx(x={},inline=false,draft=null){
 const f=inline?$('#txFormInline'):$('#txForm');f.classList.remove('hidden');
 f.innerHTML=`<h2>${x.id?'Editar lançamento':'Novo lançamento'}</h2><form id="tf" class="form-grid" novalidate>
 <div class="field"><label>Tipo</label><select name="type"><option value="expense" ${x.type==='expense'?'selected':''}>Despesa</option><option value="income" ${x.type==='income'?'selected':''}>Receita</option></select></div>
 <div class="field"><label>Valor (R$)</label><input name="amount" type="number" step=".01" min=".01" required value="${x.amount??''}"></div>
 <div class="field"><label>Data</label><input name="date" type="date" required value="${x.date||new Date().toISOString().slice(0,10)}"></div>
 <div class="field"><label>Categoria</label><input name="category" placeholder="Filamento, energia, venda..." value="${escapeHtml(x.category||'')}"></div>
 <div class="field full"><label>Descrição / anotação</label><textarea name="description" required>${escapeHtml(x.description||'')}</textarea></div>
 <div class="field full"><label for="financeReceiptFile">Anexar comprovante (PDF ou imagem)</label><input id="financeReceiptFile" name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"><small id="financeFileStatus" class="muted">PDF, JPG, PNG ou WebP · até 10 MB. Escolha o arquivo; ele ficará anexado ao formulário até você clicar em Salvar lançamento.</small>${x.attachment_path?'<small class="muted">Já existe um anexo neste lançamento. O arquivo atual será mantido se nenhum novo for selecionado.</small>':''}</div>
 <div class="field full actions">${saveIconButton('Salvar lançamento')}<button class="btn secondary" type="button" id="cancelTF">Cancelar</button></div></form>`;
 const form=$('#tf'),save=form.querySelector('button[type="submit"]'),fileInput=form.elements.file,fileStatus=$('#financeFileStatus');
 if(draft)restoreFinanceFields(form,draft);
 let draftWriteTimer=null;
 const persistFinanceForm=()=>{
  clearTimeout(draftWriteTimer);
  draftWriteTimer=setTimeout(()=>writeFinanceDraft(form,x),120);
 };
 form.addEventListener('input',persistFinanceForm);
 form.addEventListener('change',persistFinanceForm);
 // O arquivo é copiado para IndexedDB assim que selecionado. Se o Android recriar
 // a página ao voltar do seletor, o rascunho e o comprovante poderão ser recuperados.
 fileInput.addEventListener('change',async()=>{
  const selected=fileInput.files?.[0];
  if(!selected){fileStatus.textContent='Nenhum arquivo novo selecionado.';return;}
  const size=(selected.size/1024/1024).toFixed(2);
  if(size>10){toast('Arquivo acima de 10 MB.');fileInput.value='';return;}
  try{
   await storeFinanceBlob(selected);
   writeFinanceDraft(form,x,{hasFile:true,fileName:selected.name,fileType:selected.type,fileSize:selected.size});
   fileStatus.textContent=`Arquivo selecionado: ${selected.name} (${size} MB). Salve o lançamento para concluir o envio.`;
  }catch(err){fileStatus.textContent='Não foi possível guardar o arquivo neste dispositivo. Mantenha esta tela aberta até salvar.';toast('Falha ao preservar o anexo: '+(err.message||err));}
 });
 if(draft){
  (async()=>{try{const savedFile=await readFinanceBlob();if(savedFile)fileStatus.textContent=`Anexo recuperado: ${savedFile.name}. Clique em Salvar lançamento para enviar.`;}catch(e){console.warn('Falha ao recuperar anexo financeiro:',e);}})();
 }
 $('#cancelTF').onclick=()=>{clearTimeout(draftWriteTimer);clearFinanceDraft();if(inline)f.closest('.inline-finance-editor')?.remove();else f.classList.add('hidden');};
 form.addEventListener('submit',async e=>{
  e.preventDefault();e.stopPropagation();
  if(!form.reportValidity())return;
  clearTimeout(draftWriteTimer);
  const d=new FormData(form);
  let file=d.get('file');
  if(!file||!file.size){try{file=await readFinanceBlob();}catch(err){console.warn('Não foi possível recuperar o anexo:',err);}}
  let path=draft?.attachment_path||x.attachment_path||null,uploadedPath=null;
  let fileMime=file?.type||'';
  if(file&&file.size){
   const extName=(file.name||'').toLowerCase().split('.').pop();
   const mimeByExtension={pdf:'application/pdf',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp'};
   if(!['application/pdf','image/jpeg','image/png','image/webp'].includes(fileMime))fileMime=mimeByExtension[extName]||'';
   if(!fileMime){toast('Formato não permitido. Use PDF, JPG, PNG ou WebP.');return;}
   if(file.size>10*1024*1024){toast('Arquivo acima de 10 MB.');return;}
  }
  writeFinanceDraft(form,x,{hasFile:!!(file&&file.size),fileName:file?.name||null,fileType:file?.type||null,fileSize:file?.size||0});
  save.disabled=true;save.classList.add('is-loading');
  try{
   if(file&&file.size){
    const ext=({ 'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png','image/webp':'webp'})[fileMime];
    const key=`${profile.id}/${crypto.randomUUID()}.${ext}`;
    const up=await sb.storage.from('finance-files').upload(key,file,{upsert:false,contentType:fileMime});
    if(up.error)throw up.error;path=key;uploadedPath=key;
   }
   const payload={type:d.get('type'),amount:Number(d.get('amount')),date:d.get('date'),competence_month:d.get('date').slice(0,7),category:d.get('category'),description:d.get('description'),attachment_path:path};
   const res=x.id?await sb.from('financial_transactions').update(payload).eq('id',x.id).select('id').maybeSingle():await sb.from('financial_transactions').insert(payload).select('id').maybeSingle();
   if(res.error)throw res.error;
   if(!res.data)throw new Error('O lançamento não foi confirmado pelo banco.');
   form.dataset.unsaved='false';clearFinanceDraft();toast('Lançamento salvo.');await finance();
  }catch(err){
   if(uploadedPath){const cleanup=await sb.storage.from('finance-files').remove([uploadedPath]);if(cleanup.error)console.warn('Falha ao limpar anexo órfão:',cleanup.error);}
   toast('Não foi possível salvar o lançamento: '+(err.message||'Erro inesperado.'));
   save.disabled=false;save.classList.remove('is-loading');
  }
 });
}
async function orders(own){
 let q=sb.from('orders').select('*,profiles(full_name,email)').order('created_at',{ascending:false});if(own)q=q.eq('reseller_id',profile.id);const {data,error}=await q;if(error)throw error;
 const statusLabels={pending:'Aguardando análise',approved:'Aprovado',producing:'Em produção',shipped:'Enviado',completed:'Concluído',cancelled:'Cancelado'};
 const rows=data.map(o=>`<tr><td>#${o.id.slice(0,8)}</td>${own?'':`<td>${escapeHtml(o.profiles?.full_name||o.profiles?.email||'')}</td>`}<td>${date(o.created_at?.slice(0,10))}</td><td>${escapeHtml(o.order_type==='consignment'?'Consignação':o.order_type==='purchase'?'Compra de peças':o.order_type||'Venda')}</td><td>${money(o.total)}</td><td><span class="status ${o.status==='approved'||o.status==='completed'?'ok':o.status==='cancelled'?'bad':'wait'}">${statusLabels[o.status]||escapeHtml(o.status)}</span></td><td><div class="order-actions"><button type="button" class="btn secondary" data-order-details="${o.id}">Detalhes</button>${own&&isEditable(o.status)?`<button type="button" class="btn secondary" data-reseller-edit="${o.id}">Editar pedido</button>`:'' }${own&&o.order_type==='purchase'&&o.status==='approved'?`<button type="button" class="btn payment-attach-btn" data-payment-attach="${o.id}">💰 ${o.payment_attachment_path?'Substituir comprovante':'Anexar Pagamento'}</button>`:''}${!own&&o.payment_attachment_path?`<button type="button" class="btn secondary order-payment-view-btn" data-view-payment="${o.id}" aria-label="Comprovante" title="Comprovante"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3h7v7M10 14 21 3M19 13v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h7"/></svg><span>Abrir</span></button>`:''}${own?'' :`<details class="status-menu"><summary class="btn">Alterar status ▾</summary><div class="status-options">${Object.entries(statusLabels).filter(([v])=>v!==o.status).map(([v,l])=>`<button type="button" data-order-status="${o.id}" data-status="${v}">${l}</button>`).join('')}</div></details>`}</div></td></tr><tr class="order-detail-row hidden" data-detail-row="${o.id}"><td colspan="${own?6:7}"><div class="order-detail" id="order-detail-${o.id}">Carregando itens...</div></td></tr>`).join('');
 $('#content').innerHTML=`<div class="grid">${metric('Pedidos',data.length,'Total de solicitações')}${metric('Aguardando análise',data.filter(o=>o.status==='pending').length,'Precisam de atenção')}${metric('Em produção',data.filter(o=>o.status==='producing').length,'Em fabricação')}${metric('Concluídos',data.filter(o=>o.status==='completed').length,'Pedidos finalizados')}</div><div class="card section"><div class="row between"><div><h2>${own?'Seus pedidos':'Gestão de pedidos'}</h2><span class="muted">Consulte os itens e atualize o andamento sem janelas de prompt.</span></div><input id="orderSearch" placeholder="Buscar pedido ou revendedor..." style="max-width:280px"></div><div class="table-wrap"><table class="table"><thead><tr><th>Pedido</th>${own?'':'<th>Revendedor</th>'}<th>Data</th><th>Modalidade</th><th>Total</th><th>Status</th><th>Ações</th></tr></thead><tbody>${rows||`<tr><td colspan="7" class="empty">Nenhum pedido registrado.</td></tr>`}</tbody></table></div></div>`;
 $('#orderSearch').oninput=e=>{const term=e.target.value.toLocaleLowerCase('pt-BR');$('#content').querySelectorAll('tbody tr:not(.order-detail-row)').forEach(tr=>tr.hidden=!tr.textContent.toLocaleLowerCase('pt-BR').includes(term));};
 $('#content').querySelectorAll('[data-order-status]').forEach(b=>b.onclick=async()=>{const id=b.dataset.orderStatus,status=b.dataset.status;if(status==='producing'&&!await confirmProduction())return;b.disabled=true;try{const r=await sb.from('orders').update({status}).eq('id',id).select('id,status').maybeSingle();if(r.error)throw r.error;if(!r.data)throw new Error('O pedido não foi atualizado. Verifique as permissões RLS.');toast('Status atualizado.');await orders(false);}catch(err){toast('Falha ao atualizar status: '+err.message);b.disabled=false;}});
 $('#content').querySelectorAll('[data-order-details]').forEach(b=>b.onclick=async()=>{const id=b.dataset.orderDetails,row=$(`[data-detail-row="${id}"]`);row.classList.toggle('hidden');if(!row.classList.contains('hidden')){const target=$(`#order-detail-${id}`);if(target.dataset.loaded)return;try{const r=await sb.from('order_items').select('quantity,unit_price,products(name,sku)').eq('order_id',id);if(r.error)throw r.error;target.innerHTML=r.data.length?`<b>Itens do pedido</b><div class="table-wrap"><table class="table"><thead><tr><th>Produto</th><th>Quantidade</th><th>Preço unitário</th><th>Subtotal</th></tr></thead><tbody>${r.data.map(i=>`<tr><td>${escapeHtml(i.products?.name||'Produto')}</td><td>${i.quantity}</td><td>${money(i.unit_price)}</td><td>${money(Number(i.quantity)*Number(i.unit_price))}</td></tr>`).join('')}</tbody></table></div>`:'Nenhum item detalhado encontrado.';target.dataset.loaded='1';}catch(err){target.textContent='Não foi possível carregar os itens: '+err.message;}}});
 $('#content').querySelectorAll('[data-reseller-edit]').forEach(b=>b.onclick=()=>regularOrderEdit(b.dataset.resellerEdit));
 $('#content').querySelectorAll('[data-payment-attach]').forEach(b=>b.onclick=async()=>{
  const id=b.dataset.paymentAttach;const file=document.createElement('input');file.type='file';file.accept='.pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp';
  file.onchange=async()=>{const f=file.files?.[0];if(!f)return;if(f.size>10*1024*1024)return toast('O comprovante deve ter até 10 MB.');if(!['application/pdf','image/jpeg','image/png','image/webp'].includes(f.type))return toast('Formato inválido. Envie PDF, JPG, PNG ou WebP.');b.disabled=true;try{const ext=({'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png','image/webp':'webp'})[f.type],path=`${profile.id}/${id}/${crypto.randomUUID()}.${ext}`;const up=await sb.storage.from('order-payments').upload(path,f,{contentType:f.type,upsert:false});if(up.error)throw up.error;const r=await sb.rpc('attach_order_payment',{p_order:id,p_path:path});if(r.error){await sb.storage.from('order-payments').remove([path]);throw r.error;}toast('Comprovante anexado com sucesso.');await orders(true);}catch(err){toast('Não foi possível anexar o pagamento: '+err.message);b.disabled=false;}};file.click();
 });
 $('#content').querySelectorAll('[data-view-payment]').forEach(b=>b.onclick=async()=>{const o=data.find(x=>x.id===b.dataset.viewPayment);if(!o?.payment_attachment_path)return;await openPrivateStorageFile('order-payments',o.payment_attachment_path);});
}
async function newOrder(){
 const {data,error}=await sb.from('products').select('id,name,price,wholesale_price,colors').eq('active',true).order('name');if(error)throw error;
 $('#content').innerHTML=`<div class="card reseller-order-card"><div class="reseller-order-intro"><span class="eyebrow">REPOSIÇÃO DE ESTOQUE</span><h2>Solicitar novas peças</h2><p class="muted">Preços exclusivos de atacado para revendedores nas modalidades de compra e consignação.</p></div><form id="of" class="form-grid"><div class="field"><label>Modalidade</label><select name="order_type"><option value="purchase">Compra de peças</option><option value="consignment">Consignação</option></select><small id="orderMinimumHint" class="muted">Compra de peças: mínimo de 30 unidades no pedido e 10 unidades por modelo.</small></div><div class="field"><label>Previsão / observação</label><input name="notes" placeholder="Ex.: reposição para o próximo mês"></div><div class="field full"><div class="row between"><label>Peças e quantidades</label><span class="status info">Preço de atacado</span></div><div id="orderLines"></div><button type="button" class="btn secondary" id="addLine">+ Adicionar peça</button></div><div class="field full"><label>Observações adicionais</label><textarea name="details"></textarea></div><div class="field full"><div class="reseller-order-summary" id="resellerOrderSummary">Selecione os modelos e quantidades para calcular o pedido.</div></div><div class="field full"><button class="btn" type="submit">Enviar solicitação</button></div></form></div>`;
 const lines=$('#orderLines'),mode=$('#of').elements.order_type,summary=$('#resellerOrderSummary');
 const fmtPrice=p=>money(Number(p.wholesale_price??p.price??0));
 function calc(){let units=0,total=0;lines.querySelectorAll('.order-line').forEach(row=>{const p=data.find(x=>x.id===row.querySelector('.prod').value),q=Number(row.querySelector('.qty').value)||0;if(p&&q>0){units+=q;total+=q*Number(p.wholesale_price??p.price??0);}});summary.innerHTML=`<div><small>Quantidade total</small><strong>${units} peças</strong></div><div><small>Total estimado no atacado</small><strong>${money(total)}</strong></div>`;}
 function updateMode(){const purchase=mode.value==='purchase';lines.querySelectorAll('.order-line').forEach(row=>{const qty=row.querySelector('.qty');qty.min=purchase?'10':'1';if(purchase&&Number(qty.value)<10)qty.value=10;});$('#orderMinimumHint').textContent=purchase?'Compra de peças: mínimo de 30 unidades no pedido e 10 unidades por modelo.':'Consignação: sem quantidade mínima. Os valores também são de atacado.';calc();}
 function addLine(){const d=document.createElement('div');d.className='row order-line';d.style.margin='8px 0';d.style.gap='10px';d.innerHTML=`<select class="prod" aria-label="Modelo da peça" style="flex:1;min-width:180px"><option value="">Selecione uma peça</option>${data.map(p=>`<option value="${p.id}">${escapeHtml(p.name)} · ${fmtPrice(p)}</option>`).join('')}</select><input class="qty" type="number" min="${mode.value==='purchase'?10:1}" step="1" value="${mode.value==='purchase'?10:1}" aria-label="Quantidade" style="width:96px"><button type="button" class="icon-delete-btn" aria-label="Remover peça">×</button>`;d.querySelector('.prod').onchange=calc;d.querySelector('.qty').oninput=calc;d.querySelector('button').onclick=()=>{d.remove();calc();};lines.append(d);calc();}
 addLine();$('#addLine').onclick=addLine;mode.onchange=updateMode;
 let requestId=crypto.randomUUID();
 $('#of').onsubmit=async e=>{e.preventDefault();const form=e.currentTarget,submit=form.querySelector('button[type=submit]'),d=new FormData(form);const items=[...lines.children].map(x=>({product_id:x.querySelector('.prod').value,quantity:Number(x.querySelector('.qty').value)})).filter(x=>x.product_id&&Number.isInteger(x.quantity)&&x.quantity>0);if(!items.length){toast('Adicione ao menos uma peça com quantidade válida.');return;}if(items.length>30||items.some(x=>x.quantity>1000)){toast('Limite: 30 modelos e até 1.000 unidades por modelo.');return;}if(new Set(items.map(x=>x.product_id)).size!==items.length){toast('Remova modelos repetidos ou consolide suas quantidades.');return;}if(d.get('order_type')==='purchase'){const totalUnits=items.reduce((sum,x)=>sum+x.quantity,0);if(items.some(x=>x.quantity<10)){toast('Na compra de peças, cada modelo deve ter no mínimo 10 unidades.');return;}if(totalUnits<30){toast('A compra de peças exige no mínimo 30 unidades no pedido.');return;}}submit.disabled=true;try{const {data:orderId,error:orderError}=await sb.rpc('create_reseller_order_v2',{p_order_type:String(d.get('order_type')||''),p_notes:[d.get('notes'),d.get('details')].filter(Boolean).join(' | ').slice(0,2000),p_items:items,p_request_id:requestId});if(orderError)throw orderError;if(!orderId)throw new Error('O servidor não confirmou o número do pedido.');toast('Solicitação enviada à Dopamina 3D.');requestId=crypto.randomUUID();await loadTab('myorders');}catch(err){toast('Não foi possível enviar o pedido: '+(err.message||'Falha inesperada.'));submit.disabled=false;}};
}
async function shipments(own){
 let q=sb.from('shipments').select('*,profiles!shipments_reseller_id_fkey(full_name)').eq('shipment_type','consignment').order('created_at',{ascending:false});
 if(own)q=q.eq('reseller_id',profile.id);
 const {data,error}=await q;if(error)throw error;
 const shipLabels={preparing:'Em produção',sent:'Enviada',delivered:'Entregue'};
 const filter=window.shipmentFilter||'all';
 const filtered=data.filter(x=>filter==='all'||x.status===filter);
 const rows=filtered.map(s=>{
  const reseller=escapeHtml(s.profiles?.full_name||'Revendedor');
  const settlementBadge=s.settled_at?`<small class="status ok shipment-settled-badge">Acertada · ${money(s.settlement_amount)}${s.settlement_date?' · '+date(s.settlement_date):''}</small>`:'';
  const settleButton=!own&&profile.role==='admin'&&s.status==='delivered'&&!s.settled_at?`<button type="button" class="btn shipment-settle-btn" data-settle="${s.id}">Acertar</button>`:'';
  const actions=own?(s.status!=='delivered'?`<button type="button" class="btn shipment-delivered-btn" data-reseller-delivered="${s.id}">Entregue</button>`:'<span class="status ok">Entrega confirmada</span>'):`<div class="shipment-actions"><select data-ship-status="${s.id}" aria-label="Status da remessa"><option value="preparing" ${s.status==='preparing'?'selected':''}>Em produção</option><option value="sent" ${s.status==='sent'?'selected':''}>Enviada</option><option value="delivered" ${s.status==='delivered'?'selected':''}>Entregue</option></select><button type="button" class="icon-save-btn" data-ship="${s.id}" aria-label="Salvar status da remessa" title="Salvar status da remessa"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h12l4 4v14H3V3h2Z"/><path d="M7 3v6h10V3M7 21v-7h10v7M9 17h6"/></svg></button>${settleButton}</div>`;
  return `<tr><td>#${s.id.slice(0,8)}</td><td>${own?'':reseller}</td><td>${date(s.shipment_date)}</td><td>${escapeHtml(s.description||'')}${s.order_id?`<small class="muted">Pedido #${s.order_id.slice(0,8)}</small>`:''}${s.contract_id?'<small class="muted">Remessa inicial do contrato</small>':''}</td><td><span class="status ${s.status==='delivered'?'ok':s.status==='sent'?'info':'wait'}">${shipLabels[s.status]||escapeHtml(s.status)}</span><small class="muted">Consignação</small>${settlementBadge}${s.settlement_has_unsold?'<small class="status wait">Peças não vendidas devolvidas</small>':''}</td><td>${actions}</td></tr>`;
 }).join('');
 const counts={all:data.length,preparing:data.filter(x=>x.status==='preparing').length,sent:data.filter(x=>x.status==='sent').length,delivered:data.filter(x=>x.status==='delivered').length};
 $('#content').innerHTML=`<div class="card"><div class="row between"><div><h2>${own?'Suas remessas de consignação':'Expedição'}</h2><span class="muted">${own?'Acompanhe as remessas de consignação e confirme o recebimento.':'Gerencie remessas de consignação, confirme entregas e faça o acerto financeiro de cada ciclo.'}</span></div>${own?'':'<button class="btn" id="addShip">+ Nova remessa</button>'}</div><div class="status-tabs shipment-tabs"><button type="button" data-ship-filter="all" class="${filter==='all'?'active':''}">Todas <span>${counts.all}</span></button><button type="button" data-ship-filter="preparing" class="${filter==='preparing'?'active':''}">Em produção <span>${counts.preparing}</span></button><button type="button" data-ship-filter="sent" class="${filter==='sent'?'active':''}">Enviadas <span>${counts.sent}</span></button><button type="button" data-ship-filter="delivered" class="${filter==='delivered'?'active':''}">Entregues <span>${counts.delivered}</span></button></div><div class="table-wrap"><table class="table"><thead><tr><th>Remessa</th>${own?'':'<th>Revendedor</th>'}<th>Data</th><th>Descrição</th><th>Status / acerto</th><th>Ações</th></tr></thead><tbody>${rows||'<tr><td colspan="6" class="empty">Nenhuma remessa nesta etapa.</td></tr>'}</tbody></table></div></div><div id="shipForm" class="card section hidden"></div><div id="settlementForm" class="card section hidden"></div>`;
 $('#content').querySelectorAll('[data-ship-filter]').forEach(b=>b.onclick=()=>{window.shipmentFilter=b.dataset.shipFilter;shipments(own);});
 if(own){
  $('#content').querySelectorAll('[data-reseller-delivered]').forEach(b=>b.onclick=async()=>{if(!confirm('Confirma que recebeu esta remessa de consignação?\n\nAo confirmar, o status será alterado para Entregue.'))return;b.disabled=true;try{const r=await sb.rpc('reseller_confirm_shipment_delivery',{p_shipment:b.dataset.resellerDelivered});if(r.error)throw r.error;toast('Recebimento confirmado.');await shipments(true);}catch(err){toast('Não foi possível confirmar a entrega: '+err.message);b.disabled=false;}});
  return;
 }
 let productCatalog=[];
 const loadProducts=async()=>{if(productCatalog.length)return productCatalog;const r=await sb.from('products').select('id,name,wholesale_price,active').order('name');if(r.error)throw r.error;productCatalog=r.data||[];return productCatalog;};
 $('#addShip').onclick=async()=>{
  const [res,prods]=await Promise.all([sb.from('profiles').select('id,full_name,email').eq('role','reseller'),loadProducts()]);
  if(res.error)return toast('Não foi possível carregar os revendedores.');
  const f=$('#shipForm');f.classList.remove('hidden');
  f.innerHTML=`<div class="row between"><h2>Nova remessa de consignação</h2><button type="button" class="btn secondary" id="cancelShip">Cancelar</button></div><form id="sf" class="form-grid"><div class="field"><label>Revendedor</label><select name="reseller_id" required>${(res.data||[]).map(x=>`<option value="${x.id}">${escapeHtml(x.full_name||x.email)}</option>`).join('')}</select></div><div class="field"><label>Data</label><input name="shipment_date" type="date" value="${new Date().toISOString().slice(0,10)}" required></div><div class="field"><label>Status inicial</label><select name="status"><option value="preparing">Em produção</option><option value="sent">Enviada</option></select></div><div class="field full"><label>Peças da remessa</label><div id="manualShipmentItems"></div><button type="button" class="btn secondary" id="addShipmentItem">+ Adicionar peça</button></div><div class="field full"><label>Observações</label><input name="notes" maxlength="500"></div><div class="field full actions"><button class="btn" type="submit">Criar remessa</button></div></form>`;
  const lines=$('#manualShipmentItems');
  const addLine=()=>{
   const row=document.createElement('div');row.className='row shipment-item-line';row.style.cssText='gap:8px;margin:8px 0;align-items:center;flex-wrap:wrap';
   row.innerHTML=`<select class="ship-product" style="flex:1;min-width:190px"><option value="">Peça fora do catálogo</option>${prods.map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}</select><input class="ship-free" placeholder="Descrição da peça" style="flex:1;min-width:150px"><input class="ship-wholesale" type="number" min="0" step="0.01" placeholder="Repasse un. (R$)" style="width:130px"><input class="ship-qty" type="number" min="1" value="1" style="width:82px" aria-label="Quantidade"><button type="button" class="icon-delete-btn" aria-label="Remover">×</button>`;
   const sel=row.querySelector('.ship-product'),name=row.querySelector('.ship-free'),price=row.querySelector('.ship-wholesale');
   sel.onchange=()=>{const p=prods.find(x=>x.id===sel.value);if(p){name.value=p.name;name.disabled=true;price.value=Number(p.wholesale_price||0).toFixed(2);price.readOnly=true;}else{name.value='';name.disabled=false;price.value='';price.readOnly=false;}};
   row.querySelector('button').onclick=()=>row.remove();lines.append(row);
  };
  addLine();$('#addShipmentItem').onclick=addLine;$('#cancelShip').onclick=()=>f.classList.add('hidden');
  $('#sf').onsubmit=async e=>{
   e.preventDefault();
   const items=[...lines.querySelectorAll('.shipment-item-line')].map(r=>{const id=r.querySelector('.ship-product').value,p=prods.find(x=>x.id===id),name=(p?.name||r.querySelector('.ship-free').value).trim(),qty=Number(r.querySelector('.ship-qty').value),unit=Number(r.querySelector('.ship-wholesale').value);return {product_id:p?.id||null,product_name:name,quantity:qty,unit_wholesale_price:unit};}).filter(x=>x.product_name&&Number.isInteger(x.quantity)&&x.quantity>0);
   if(!items.length)return toast('Adicione ao menos uma peça.');
   if(items.some(x=>!Number.isFinite(x.unit_wholesale_price)||x.unit_wholesale_price<0))return toast('Informe o valor de atacado/repasse de cada peça fora do catálogo.');
   const d=new FormData(e.target),description=items.map(i=>`${i.quantity}× ${i.product_name}`).join('; ')+(d.get('notes')?' | Obs.: '+d.get('notes'):'');
   const payload={reseller_id:d.get('reseller_id'),shipment_date:d.get('shipment_date'),status:d.get('status'),shipment_type:'consignment',description};
   const created=await sb.from('shipments').insert(payload).select('id').single();if(created.error){toast('Não foi possível criar a remessa: '+created.error.message);return;}
   const saved=await sb.from('shipment_items').insert(items.map(i=>({...i,shipment_id:created.data.id})));
   if(saved.error){await sb.from('shipments').delete().eq('id',created.data.id);toast('Não foi possível registrar os itens da remessa: '+saved.error.message);return;}
   toast('Remessa criada com composição e valores de atacado registrados.');window.shipmentFilter='all';shipments(false);
  };
 };
 $('#content').querySelectorAll('[data-ship]').forEach(b=>b.onclick=async()=>{const status=$(`[data-ship-status="${b.dataset.ship}"]`).value;if(!confirm(`Salvar situação da remessa como “${shipLabels[status]}”?`))return;b.disabled=true;try{const r=await sb.from('shipments').update({status}).eq('id',b.dataset.ship).select('id').maybeSingle();if(r.error)throw r.error;if(!r.data)throw new Error('Atualização não autorizada.');toast('Situação da remessa atualizada.');await shipments(false);}catch(e){toast('Falha ao atualizar: '+e.message);b.disabled=false;}});
 $('#content').querySelectorAll('[data-settle]').forEach(b=>b.onclick=async()=>{
  const shipment=data.find(x=>x.id===b.dataset.settle);if(!shipment)return;
  const box=$('#settlementForm');box.classList.remove('hidden');box.innerHTML='<div class="muted">Carregando composição da remessa…</div>';box.scrollIntoView({behavior:'smooth',block:'start'});
  try{
   const [itemsResult,prods]=await Promise.all([sb.from('shipment_items').select('*').eq('shipment_id',shipment.id).order('created_at'),loadProducts()]);
   if(itemsResult.error)throw itemsResult.error;
   let shippedItems=itemsResult.data||[];
   // Compatibilidade com remessas antigas da v13: recupera "10× Produto; 2× Produto" da descrição.
   if(!shippedItems.length){
    const desc=String(shipment.description||'').split('| Obs.:')[0];
    const chunks=desc.split(/;\s*/);
    const inferred=[];
    for(const chunk of chunks){
     const m=chunk.match(/^\s*(\d+)\s*[×x]\s*(.+?)\s*$/i);if(!m)continue;
     const name=m[2].trim(),p=prods.find(x=>x.name.toLocaleLowerCase('pt-BR')===name.toLocaleLowerCase('pt-BR'));
     inferred.push({product_id:p?.id||null,product_name:name,quantity:Number(m[1]),unit_wholesale_price:Number(p?.wholesale_price||0),legacy_inferred:true});
    }
    shippedItems=inferred;
   }
   if(!shippedItems.length){box.innerHTML='<h2>Composição da remessa não encontrada</h2><p class="muted">Esta remessa antiga não possui itens estruturados nem uma descrição que permita recuperar as peças. Para calcular o acerto com segurança, edite a composição da remessa ou crie uma remessa detalhada.</p><button type="button" class="btn secondary" id="closeSettlement">Fechar</button>';box.querySelector('#closeSettlement').onclick=()=>box.classList.add('hidden');return;}
   if(shippedItems.some(i=>!Number.isFinite(Number(i.unit_wholesale_price))))throw new Error('Há item sem preço de atacado válido na composição.');
   const expectedQty=shippedItems.reduce((n,i)=>n+Number(i.quantity),0),expectedValue=shippedItems.reduce((n,i)=>n+Number(i.quantity)*Number(i.unit_wholesale_price),0);
   const catalogOptions=prods.map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
   box.innerHTML=`<div class="row between"><div><h2>Acerto da remessa</h2><p class="muted">Revendedor: <b>${escapeHtml(shipment.profiles?.full_name||'Revendedor')}</b> · Remessa #${shipment.id.slice(0,8)}</p></div><button type="button" class="btn secondary" id="cancelSettlement">Cancelar</button></div><form id="settlementFormFields" class="form-grid"><div class="field"><label>Data do acerto / recebimento</label><input name="settlement_date" type="date" value="${new Date().toISOString().slice(0,10)}" required></div><div class="field full"><label>Houve peças que sobraram por não terem sido vendidas durante o ciclo?</label><select name="has_unsold" id="settlementHasUnsold" required><option value="no">Não, todas foram vendidas</option><option value="yes">Sim, houve peças não vendidas</option></select></div><div class="field full hidden" id="settlementReturns"><div class="settlement-return-head"><b>Peças devolvidas / não vendidas</b><small class="muted">Adicione cada modelo separadamente e informe a quantidade.</small></div><div id="returnLines"></div><button type="button" class="btn secondary" id="addReturnLine">+ Adicionar peça devolvida</button><div class="settlement-summary hidden" id="settlementSummary"><div class="settlement-summary-grid"><div><small>Quantidade enviada</small><b id="sumExpectedQty">0</b></div><div><small>Valor total da remessa</small><b id="sumExpectedValue">R$ 0,00</b></div><div><small>Quantidade devolvida</small><b id="sumReturnedQty">0</b></div><div><small>Valor das devoluções</small><b id="sumReturnedValue">R$ 0,00</b></div><div class="settlement-summary-total"><small>Valor das peças vendidas / a receber</small><b id="sumSoldValue">R$ 0,00</b></div></div><small class="muted">Cálculo: valor total enviado menos o valor de atacado das peças devolvidas.</small></div></div><div class="field full"><label>Observações (opcional)</label><textarea name="description" maxlength="500" placeholder="Observações adicionais sobre o acerto."></textarea></div><div class="field full"><button type="submit" class="btn settlement-confirm-btn">Acertar</button></div></form>`;
   const hasUnsold=box.querySelector('#settlementHasUnsold'),returnsWrap=box.querySelector('#settlementReturns'),returnLines=box.querySelector('#returnLines'),summary=box.querySelector('#settlementSummary');
   const moneyText=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(n)||0);
   const available=shippedItems.map(i=>({...i,remaining:Number(i.quantity)}));
   const updateSummary=()=>{
    const lines=[...returnLines.querySelectorAll('.return-item-line')],valid=lines.map(r=>({qty:Number(r.querySelector('.return-qty').value),price:Number(r.querySelector('.return-price').value)})).filter(x=>Number.isInteger(x.qty)&&x.qty>0&&Number.isFinite(x.price)&&x.price>=0);
    const rq=valid.reduce((n,x)=>n+x.qty,0),rv=valid.reduce((n,x)=>n+x.qty*x.price,0);
    box.querySelector('#sumExpectedQty').textContent=expectedQty;box.querySelector('#sumExpectedValue').textContent=moneyText(expectedValue);box.querySelector('#sumReturnedQty').textContent=rq;box.querySelector('#sumReturnedValue').textContent=moneyText(rv);box.querySelector('#sumSoldValue').textContent=moneyText(Math.max(0,expectedValue-rv));
    const sold=box.querySelector('#sumSoldValue');sold.classList.toggle('is-invalid',rv>expectedValue);
    return {rq,rv,soldValue:expectedValue-rv,lines};
   };
   const addReturnLine=()=>{
    const row=document.createElement('div');row.className='return-item-line';
    row.innerHTML=`<select class="return-product" aria-label="Peça devolvida"><option value="">Peça fora do catálogo</option>${catalogOptions}</select><input class="return-free" placeholder="Descreva a peça fora do catálogo" aria-label="Descrição da peça fora do catálogo"><input class="return-qty" type="number" min="1" step="1" value="1" aria-label="Quantidade devolvida"><label class="return-price-wrap"><small>Atacado unit.</small><input class="return-price" type="number" min="0" step="0.01" inputmode="decimal" aria-label="Valor de atacado unitário"></label><button type="button" class="icon-delete-btn" aria-label="Remover peça">×</button>`;
    const sel=row.querySelector('.return-product'),free=row.querySelector('.return-free'),qty=row.querySelector('.return-qty'),price=row.querySelector('.return-price');
    sel.onchange=()=>{
     const chosen=sel.value,shipped=available.filter(x=>x.product_id===chosen),p=prods.find(x=>x.id===chosen);
     if(chosen){
      free.value=p?.name||'';free.disabled=true;
      const snapshot=shipped.length?Number(shipped[0].unit_wholesale_price):Number(p?.wholesale_price||0);
      price.value=snapshot.toFixed(2);price.readOnly=true;
      const max=shipped.reduce((n,x)=>n+x.remaining,0);qty.max=String(max||999999);
     }else{free.value='';free.disabled=false;price.value='';price.readOnly=false;qty.removeAttribute('max');}
     updateSummary();
    };
    [qty,price,free].forEach(el=>el.addEventListener('input',updateSummary));
    row.querySelector('button').onclick=()=>{row.remove();updateSummary();};returnLines.append(row);updateSummary();
   };
   hasUnsold.onchange=()=>{const yes=hasUnsold.value==='yes';returnsWrap.classList.toggle('hidden',!yes);summary.classList.toggle('hidden',!yes);if(yes&&!returnLines.children.length)addReturnLine();};
   box.querySelector('#addReturnLine').onclick=addReturnLine;
   box.querySelector('#cancelSettlement').onclick=()=>box.classList.add('hidden');
   box.querySelector('#settlementFormFields').onsubmit=async e=>{
    e.preventDefault();
    const d=new FormData(e.target),settlementDate=String(d.get('settlement_date')||''),hasLeftovers=d.get('has_unsold')==='yes',note=String(d.get('description')||'').trim();
    if(!settlementDate){toast('Informe a data do acerto.');return;}
    const calc=updateSummary();let returns=[];
    if(hasLeftovers){
     const rows=[...returnLines.querySelectorAll('.return-item-line')];
     if(!rows.length)return toast('Adicione ao menos uma peça devolvida.');
     for(const row of rows){
      const productId=row.querySelector('.return-product').value||null;
      const name=productId?prods.find(p=>p.id===productId)?.name:String(row.querySelector('.return-free').value||'').trim();
      const qty=Number(row.querySelector('.return-qty').value),unit=Number(row.querySelector('.return-price').value);
      if(!name||!Number.isInteger(qty)||qty<1||!Number.isFinite(unit)||unit<0)return toast('Confira descrição, quantidade e valor de atacado de cada peça devolvida.');
      const shippedQty=productId?available.filter(x=>x.product_id===productId).reduce((n,x)=>n+x.remaining,0):null;
      if(productId&&shippedQty===0)return toast('A peça selecionada não consta na composição desta remessa.');
      if(productId&&qty>shippedQty)return toast(`A quantidade devolvida de ${name} supera a quantidade enviada (${shippedQty}).`);
      returns.push({product_id:productId,product_name:name,quantity:qty,unit_wholesale_price:unit});
     }
     const returnedQty=returns.reduce((n,x)=>n+x.quantity,0),returnedValue=returns.reduce((n,x)=>n+x.quantity*x.unit_wholesale_price,0);
     const byProduct=new Map();returns.filter(x=>x.product_id).forEach(x=>byProduct.set(x.product_id,(byProduct.get(x.product_id)||0)+x.quantity));
     for(const [pid,qty] of byProduct){const shipped=available.filter(x=>x.product_id===pid).reduce((n,x)=>n+x.remaining,0);if(qty>shipped)return toast(`A quantidade devolvida de ${prods.find(p=>p.id===pid)?.name||'um produto'} supera a quantidade enviada (${shipped}).`);}
     if(returnedQty>expectedQty)return toast('A quantidade devolvida supera a quantidade total enviada.');
     if(returnedValue>expectedValue+0.001)return toast('O valor das peças devolvidas não pode superar o valor total da remessa.');
    }
    const returnedValue=returns.reduce((n,x)=>n+x.quantity*x.unit_wholesale_price,0);
    const amount=Math.max(0,Number((expectedValue-returnedValue).toFixed(2)));
    const returnedQty=returns.reduce((n,x)=>n+x.quantity,0);
    const btn=e.target.querySelector('button[type="submit"]');btn.disabled=true;
    let transactionId=null,updated=false;
    try{
     const financialDescription=[`Acerto de consignação — ${shipment.profiles?.full_name||'Revendedor'} — remessa #${shipment.id.slice(0,8)}`,`Enviado: ${expectedQty} peça(s), ${moneyText(expectedValue)}`,`Devolvido: ${returnedQty} peça(s), ${moneyText(returnedValue)}`,`Vendido / a receber: ${moneyText(amount)}`,note].filter(Boolean).join(' | ').slice(0,500);
     if(amount>0){
      const tx=await sb.from('financial_transactions').insert({type:'income',amount,date:settlementDate,competence_month:settlementDate.slice(0,7),category:'Acerto de consignação',description:financialDescription}).select('id').single();
      if(tx.error)throw tx.error;transactionId=tx.data.id;
     }
     const upd=await sb.from('shipments').update({settled_at:new Date().toISOString(),settlement_date:settlementDate,settlement_amount:amount,settled_by:profile.id,settlement_has_unsold:hasLeftovers,settlement_unsold_details:hasLeftovers?returns.map(x=>`${x.quantity}× ${x.product_name} (${moneyText(x.unit_wholesale_price)} un.)`).join('; '):null}).eq('id',shipment.id).is('settled_at',null).select('id').maybeSingle();
     if(upd.error||!upd.data)throw upd.error||new Error('Esta remessa já foi acertada.');updated=true;
     if(returns.length){
      const saved=await sb.from('shipment_return_items').insert(returns.map(x=>({...x,shipment_id:shipment.id})));
      if(saved.error)throw saved.error;
     }
     toast(amount>0?'Acerto concluído e valor lançado no Financeiro.':'Acerto concluído: não há valor a receber nesta remessa.');
     await shipments(false);
    }catch(err){
     if(updated)await sb.from('shipments').update({settled_at:null,settlement_date:null,settlement_amount:null,settled_by:null,settlement_has_unsold:false,settlement_unsold_details:null}).eq('id',shipment.id);
     if(transactionId){const rollback=await sb.from('financial_transactions').delete().eq('id',transactionId);if(rollback.error)console.error('Falha ao reverter lançamento financeiro após erro no acerto:',rollback.error);}
     toast('Não foi possível concluir o acerto: '+(err.message||'Erro inesperado.'));btn.disabled=false;
    }
   };
  }catch(err){box.innerHTML=`<h2>Não foi possível abrir o acerto</h2><p class="muted">${escapeHtml(err.message||'Erro inesperado.')}</p><button type="button" class="btn secondary" id="closeSettlement">Fechar</button>`;box.querySelector('#closeSettlement').onclick=()=>box.classList.add('hidden');}
 });
}

async function contracts(own){
 let q=sb.from('contracts').select('*,profiles(full_name)').order('created_at',{ascending:false});
 if(own)q=q.eq('reseller_id',profile.id);
 const {data,error}=await q;if(error)throw error;
 const filter=window.contractFilter||'all';
 const isClosed=c=>['terminated','closed','ended','cancelled'].includes(String(c.status||'').toLowerCase());
 const filtered=(data||[]).filter(c=>filter==='all'||(filter==='active'?!isClosed(c):isClosed(c)));
 const counts={all:data.length,active:data.filter(c=>!isClosed(c)).length,closed:data.filter(isClosed).length};
 const statusInfo=c=>{
  if(isClosed(c))return {label:'Encerrado',className:'is-closed'};
  return {label:'Ativo',className:'is-active'};
 };
 const signatureInfo=c=>{
  const state=String(c.digital_signature_status||'').toLowerCase();
  if(state==='verified')return {label:'Assinado digitalmente',className:'signature-verified'};
  if(state==='invalid')return {label:'Assinatura digital inválida',className:'signature-invalid'};
  return {label:'Não assinado digitalmente',className:'signature-unverified'};
 };
 const initials=name=>String(name||'Revendedor').trim().split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'RV';
 $('#content').innerHTML=`<div class="card contracts-card"><div class="contracts-header"><div class="contracts-heading"><span class="eyebrow">${own?'ÁREA DO REVENDEDOR':'GESTÃO DOCUMENTAL'}</span><h2>${own?'Contrato firmado':'Contratos'}</h2><p class="muted">${own?'Consulte o documento e a situação do seu contrato.':'Gerencie os documentos e o ciclo de vida dos contratos.'}</p></div>${profile.role==='admin'&&!own?'<div class="contract-header-actions"><button class="btn secondary" id="addContract">Anexar contrato</button></div>':''}</div><div class="status-tabs contract-tabs"><button type="button" data-contract-filter="all" class="${filter==='all'?'active':''}">Todos <span>${counts.all}</span></button><button type="button" data-contract-filter="active" class="${filter==='active'?'active':''}">Ativos <span>${counts.active}</span></button><button type="button" data-contract-filter="closed" class="${filter==='closed'?'active':''}">Encerrados <span>${counts.closed}</span></button></div><div class="contracts-list">${filtered.length?filtered.map(c=>{const name=own?'Seu contrato':(c.profiles?.full_name||'Revendedor'),st=statusInfo(c),sig=signatureInfo(c),isDigitallySigned=String(c.digital_signature_status||'').toLowerCase()==='verified',documentDate=isDigitallySigned?(c.signed_at||c.digital_signature_checked_at):(c.updated_at||c.created_at),when=isDigitallySigned?`Assinado em ${date(documentDate)}`:`Criado em ${date(documentDate)}`;return `<article class="contract-row"><div class="contract-main"><div class="contract-avatar" aria-hidden="true">${escapeHtml(initials(name))}</div><div class="contract-info"><b>${escapeHtml(name)}</b><span class="contract-subtitle">${escapeHtml(c.title||'Contrato de consignação')}</span><span class="contract-meta"><span class="contract-status ${st.className}">${st.label}</span><span class="contract-signature ${sig.className}">${sig.label}</span><span>${when}</span></span></div></div><div class="contract-actions"><button type="button" class="btn secondary contract-open-btn" data-contract="${escapeHtml(c.file_path)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3h7v7M10 14 21 3M19 13v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h7"/></svg><span>Abrir</span></button>${!own&&profile.role==='admin'&&!isClosed(c)?`<button type="button" class="icon-close-contract" data-close-contract="${c.id}" aria-label="Encerrar contrato" title="Encerrar contrato"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M8 12h8"/></svg></button>`:''}</div></article>`;}).join(''):'<div class="empty contracts-empty">Nenhum contrato nesta categoria.</div>'}</div></div>`;
 $('#content').querySelectorAll('[data-contract-filter]').forEach(b=>b.onclick=()=>{window.contractFilter=b.dataset.contractFilter;contracts(own);});
 $('#content').querySelectorAll('[data-contract]').forEach(a=>a.onclick=async()=>{await openPrivateStorageFile('contracts',a.dataset.contract);});
 $('#content').querySelectorAll('[data-close-contract]').forEach(b=>b.onclick=async()=>{
  const c=data.find(x=>x.id===b.dataset.closeContract);if(!c)return;
  if(!await confirmDelete(`Encerrar o contrato “${c.title}” de ${c.profiles?.full_name||'revendedor'}? O documento será mantido no histórico.`, 'Encerrar contrato?', 'Sim, encerrar'))return;
  b.disabled=true;
  try{const r=await sb.from('contracts').update({status:'terminated'}).eq('id',c.id).select('id').maybeSingle();if(r.error)throw r.error;if(!r.data)throw new Error('Não foi possível atualizar o contrato.');toast('Contrato encerrado.');await contracts(false);}
  catch(err){toast('Falha ao encerrar contrato: '+err.message);b.disabled=false;}
 });
 if(profile.role==='admin'&&!own)$('#addContract').onclick=async()=>{
  const {data:res,error:resError}=await sb.from('profiles').select('id,full_name,email').eq('role','reseller');if(resError)throw resError;
  const f=document.createElement('div');f.className='card section';
  f.innerHTML=`<div class="row between"><h2>Anexar contrato</h2><button type="button" class="btn secondary" id="cancelContract">Cancelar</button></div><form id="cf" class="form-grid"><div class="field"><label>Revendedor</label><select name="reseller_id">${(res||[]).map(x=>`<option value="${x.id}">${escapeHtml(x.full_name||x.email)}</option>`).join('')}</select></div><div class="field"><label>Título</label><input name="title" required value="Contrato de consignação"></div><div class="field"><label>Data de assinatura</label><input type="date" name="signed_at" value="${new Date().toISOString().slice(0,10)}"></div><div class="field"><label>Arquivo PDF</label><input type="file" name="file" accept="application/pdf" required></div><div class="field full">${saveIconButton("Salvar contrato")}</div></form>`;
  $('#content').append(f);$('#cancelContract').onclick=()=>f.remove();
  $('#cf').onsubmit=async e=>{
   e.preventDefault();const d=new FormData(e.target),file=d.get('file');if(!file||file.type!=='application/pdf'){toast('Envie um PDF.');return;}
   const key=`${d.get('reseller_id')}/${crypto.randomUUID()}.pdf`,up=await sb.storage.from('contracts').upload(key,file);if(up.error)throw up.error;
   const r=await sb.from('contracts').insert({reseller_id:d.get('reseller_id'),title:d.get('title'),signed_at:null,file_path:key,status:'active',digital_signature_status:'not_verified'});if(r.error)throw r.error;
   toast('Contrato anexado.');contracts(false);
  };
 };
}

async function users(){
 const {data,error}=await sb.from('profiles').select('*').order('created_at',{ascending:false});if(error)throw error;
 const ids=(data||[]).map(u=>u.id);let detailMap={};if(ids.length){const dr=await sb.from('customer_profiles').select('user_id,account_kind,document_type,document_number,phone,postal_code,street,address_number,complement,neighborhood,city,state,business_legal_name,business_trade_name,business_location_name,job_title,profile_completed').in('user_id',ids);if(dr.error)throw dr.error;detailMap=Object.fromEntries((dr.data||[]).map(d=>[d.user_id,d]));}
 const rows=(data||[]).map(u=>{const d=detailMap[u.id];const canChangeRole=['reseller','collaborator'].includes(u.role);const details=d?.profile_completed?`<small>${escapeHtml(d.phone||'')}${d.document_number?`<br>${escapeHtml(d.document_type||'Documento')}: ${escapeHtml(d.document_number)}`:''}${d.business_legal_name?`<br>${escapeHtml(d.business_legal_name)}`:''}${d.business_trade_name?`<br>${escapeHtml(d.business_trade_name)}`:''}${d.business_location_name?`<br>${escapeHtml(d.business_location_name)}`:''}${d.job_title?`<br>${escapeHtml(d.job_title)}`:''}${d.street?`<br>${escapeHtml([d.street,d.address_number,d.complement,d.neighborhood].filter(Boolean).join(', '))}`:''}${d.city?`<br>${escapeHtml(d.city)}${d.state?'/'+escapeHtml(d.state):''}`:''}${d.postal_code?`<br>CEP ${escapeHtml(d.postal_code)}`:''}</small>`:'<span class="status wait">Pendente</span>';const actions=u.id===profile.id?'Sua conta':`<div class="user-actions">${canChangeRole?`<select class="user-role-select" data-role="${u.id}" aria-label="Perfil de ${escapeHtml(u.email)}"><option value="reseller" ${u.role==='reseller'?'selected':''}>Revendedor</option><option value="collaborator" ${u.role==='collaborator'?'selected':''}>Colaborador</option></select><button class="icon-save-btn" type="button" data-save-role="${u.id}" aria-label="Salvar perfil" title="Salvar perfil"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h12l4 4v14H3V3h2Z"/><path d="M7 3v6h10V3M7 21v-7h10v7M9 17h6"/></svg></button>`:'<small class="muted">Cadastro público de cliente</small>'}<button class="btn ${u.is_active===false?'secondary':'danger'} user-action-btn" data-active="${u.id}" data-next="${u.is_active===false?'true':'false'}">${u.is_active===false?'Reativar acesso':'Desativar acesso'}</button></div>`;return `<tr><td><b>${escapeHtml(u.full_name||'—')}</b></td><td>${escapeHtml(u.email)}</td><td><span class="pill">${labels[u.role]||u.role}</span></td><td>${details}</td><td><span class="status ${u.is_active===false?'bad':'ok'}">${u.is_active===false?'Desativado':'Ativo'}</span></td><td>${date(u.created_at?.slice(0,10))}</td><td><div class="actions">${actions}</div></td></tr>`}).join('');
 $('#content').innerHTML=`<div class="card"><div class="row between"><div><h2>Usuários e permissões</h2><p class="muted">Convide usuários por e-mail e controle os acessos. Apenas administradores podem gerenciar contas.</p></div></div><form id="inviteUser" class="form-grid section"><div class="field"><label>Nome completo</label><input name="full_name" required maxlength="120"></div><div class="field"><label>E-mail</label><input name="email" type="email" required maxlength="254"></div><div class="field"><label>Perfil inicial</label><select name="role"><option value="reseller">Revendedor</option><option value="collaborator">Colaborador</option></select></div><div class="field" style="align-self:end"><button class="btn">Enviar convite</button></div></form><div class="table-wrap section"><table class="table"><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Dados cadastrais</th><th>Situação</th><th>Cadastro</th><th>Ações</th></tr></thead><tbody>${rows||'<tr><td colspan="7" class="empty">Nenhum usuário cadastrado.</td></tr>'}</tbody></table></div><div class="alert">A função segura admin-users precisa estar implantada no Supabase. Convites e bloqueios são executados no servidor; a chave service_role nunca é enviada ao navegador. Não é permitido promover usuários a administrador por esta tela.</div></div>`;
 const callAdmin=async payload=>{const {data,error}=await sb.functions.invoke('admin-users',{body:payload});if(error)throw error;if(data?.error)throw new Error(data.error);return data;};
 $('#inviteUser').onsubmit=async e=>{e.preventDefault();const d=new FormData(e.target),btn=e.target.querySelector('button');btn.disabled=true;try{await callAdmin({action:'invite',full_name:d.get('full_name'),email:d.get('email'),role:d.get('role')});toast('Convite enviado por e-mail.');users();}catch(err){toast('Falha ao convidar: '+err.message);}finally{btn.disabled=false;}};
 $('#content').querySelectorAll('[data-save-role]').forEach(b=>b.onclick=async()=>{const role=$(`[data-role="${b.dataset.saveRole}"]`).value;if(!confirm('Confirmar alteração do perfil deste usuário?'))return;try{await callAdmin({action:'set_role',user_id:b.dataset.saveRole,role});toast('Perfil atualizado.');users();}catch(err){toast('Falha ao alterar perfil: '+err.message);}});
 $('#content').querySelectorAll('[data-active]').forEach(b=>b.onclick=async()=>{const active=b.dataset.next==='true';if(!confirm(active?'Reativar este usuário?':'Desativar o acesso deste usuário?'))return;try{await callAdmin({action:'set_active',user_id:b.dataset.active,active});toast(active?'Usuário reativado.':'Usuário desativado.');users();}catch(err){toast('Falha ao alterar acesso: '+err.message);}});
}
function showPasswordForm(firstAccess=false){
 $('#loginView').classList.remove('hidden');$('#appView').classList.add('hidden');
 const card=$('.login-card');
 let box=$('#resetPasswordBox');
 if(!box){box=document.createElement('section');box.id='resetPasswordBox';box.innerHTML=`<h2 id="passwordFormTitle">Criar sua senha</h2><p id="passwordFormIntro">Este é seu primeiro acesso. Crie uma senha para proteger sua conta.</p><form id="resetPasswordForm"><div class="field"><label>Nova senha (mínimo 10 caracteres)</label><input id="newPassword" type="password" minlength="10" autocomplete="new-password" required></div><div class="field"><label>Confirme sua senha</label><input id="confirmPassword" type="password" minlength="10" autocomplete="new-password" required></div><button class="btn" style="width:100%">Salvar senha e continuar</button></form><p id="resetMsg" aria-live="polite"></p>`;card.append(box);}
 box.classList.remove('hidden');$('#loginForm').classList.add('hidden');
 $('#passwordFormTitle').textContent=firstAccess?'Bem-vindo à Dopamina 3D!':'Redefinir senha';
 $('#passwordFormIntro').textContent=firstAccess?'Para concluir seu primeiro acesso, crie uma senha pessoal.':'Escolha uma nova senha para sua conta.';
 $('#resetPasswordForm').onsubmit=async e=>{
  e.preventDefault();const btn=e.target.querySelector('button');const password=$('#newPassword').value;const confirmation=$('#confirmPassword').value;const msg=$('#resetMsg');
  if(password.length<10){msg.textContent='A senha precisa ter pelo menos 10 caracteres.';return;}
  if(password!==confirmation){msg.textContent='As senhas não coincidem.';return;}
  btn.disabled=true;msg.textContent='Salvando sua senha...';
  try{
   if(firstAccess){const {data,error:fnError}=await sb.functions.invoke('admin-users',{body:{action:'complete_setup',password}});if(fnError)throw fnError;if(data?.error)throw new Error(data.error);}
   else{const {error}=await sb.auth.updateUser({password});if(error)throw error;}
   passwordRecoveryMode=false;box.classList.add('hidden');$('#loginForm').classList.remove('hidden');$('#newPassword').value='';$('#confirmPassword').value='';
   msg.textContent='';await session();toast('Senha salva com sucesso.');
  }catch(err){msg.textContent='Não foi possível concluir: '+(err.message||'Erro inesperado.');}
  finally{btn.disabled=false;}
 };
}
function showPasswordReset(){passwordRecoveryMode=true;showPasswordForm(false);}

async function init(){
 if(!configOk){$('#configAlert').classList.remove('hidden');$('#loginForm').onsubmit=e=>{e.preventDefault();showLogin('Configure o Supabase antes de entrar.');};return;}
 sb=window.supabase.createClient(window.DOPAMINA_SUPABASE_URL,window.DOPAMINA_SUPABASE_ANON_KEY);
 $('#loginForm').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;const typedPassword=$('#password').value;try{const {error}=await sb.auth.signInWithPassword({email:$('#email').value.trim(),password:typedPassword});if(error)throw error;passwordJustUsed=typedPassword;await session();}catch(error){showLogin(authMessage(error));}finally{b.disabled=false;}};
 $('#logout').onclick=async()=>{await sb.auth.signOut();profile=null;showLogin('Você saiu da sua conta.');};
 $('#forgotPassword').onclick=async()=>{const email=$('#email').value.trim();if(!email){showLogin('Informe seu e-mail no campo acima para receber o link de recuperação.');$('#email').focus();return;}const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:new URL('redefinir-senha.html',location.href).href});showLogin(error?'Não foi possível solicitar a recuperação: '+authMessage(error):'Se o endereço estiver cadastrado, você receberá um e-mail com as instruções para redefinir a senha.');};
 const {data:{session:initialSession}}=await sb.auth.getSession();if(initialSession)await sessionCheck();else showLogin();
 sb.auth.onAuthStateChange((event)=>{
  if(event==='PASSWORD_RECOVERY'){showPasswordReset();return;}
  if(event==='SIGNED_IN'||event==='TOKEN_REFRESHED')setTimeout(()=>session().catch(e=>{if(appShownKey)console.warn('Revalidação em segundo plano falhou (tela mantida):',e);else showLogin(authMessage(e));}),0);
  if(event==='SIGNED_OUT'){profile=null;showLogin();}
 });
}
function authMessage(error){const m=String(error?.message||error||'Erro inesperado');if(/invalid login credentials/i.test(m))return 'E-mail ou senha incorretos.';if(/email not confirmed/i.test(m))return 'Confirme seu e-mail pelo convite antes de entrar.';if(/expired|invalid.*token/i.test(m))return 'O convite expirou ou já foi utilizado. Solicite um novo convite ao administrador.';if(/fetch|network/i.test(m))return 'Falha de conexão. Verifique sua internet e tente novamente.';return m;}
async function session(){if(sessionTask)return sessionTask;sessionTask=sessionCheck().finally(()=>{sessionTask=null;});return sessionTask;}
async function sessionCheck(){
 const {data:{user},error:userError}=await sb.auth.getUser();if(userError)throw userError;if(!user){profile=null;showLogin();return;}
 const {data,error}=await sb.from('profiles').select('*').eq('id',user.id).maybeSingle();
 if(error)throw new Error('Não foi possível consultar seu perfil: '+error.message);
 if(!data){await sb.auth.signOut();showLogin('Sua conta foi autenticada, mas ainda não possui perfil associado. Peça ao administrador para reenviar o convite.');return;}
 if(data.is_active===false){await sb.auth.signOut();showLogin('Seu acesso está desativado. Entre em contato com a administração.');return;}
 if(data.must_set_password){
  // Se o usuário acabou de entrar com uma senha válida, não o obrigue a escolher outra.
  // A Edge Function apenas sincroniza a senha já autenticada e encerra o indicador de convite pendente.
  if(passwordJustUsed){
   const existingPassword=passwordJustUsed;passwordJustUsed=null;
   const {data:setupData,error:setupError}=await sb.functions.invoke('admin-users',{body:{action:'complete_setup',password:existingPassword}});
   if(setupError)throw setupError;if(setupData?.error)throw new Error(setupData.error);
   const refreshed=await sb.from('profiles').select('*').eq('id',user.id).maybeSingle();
   if(refreshed.error)throw refreshed.error;
   if(!refreshed.data||refreshed.data.must_set_password)throw new Error('Não foi possível concluir a configuração da conta. Tente entrar novamente.');
   Object.assign(data,refreshed.data);
  }else{profile=data;showPasswordForm(true);return;}
 }
 passwordJustUsed=null;
 if(!['admin','collaborator','reseller','customer'].includes(data.role)){await sb.auth.signOut();showLogin('Seu perfil está inválido. Entre em contato com a administração.');return;}
 if(['reseller','collaborator'].includes(data.role)){const {data:details,error:detailsError}=await sb.from('customer_profiles').select('profile_completed').eq('user_id',user.id).maybeSingle();if(detailsError)throw detailsError;if(!details?.profile_completed){location.replace('completar-cadastro.html');return;}}
 if(data.role==='customer'){const {data:details,error:detailsError}=await sb.from('customer_profiles').select('profile_completed').eq('user_id',user.id).maybeSingle();if(detailsError)throw detailsError;if(!details?.profile_completed){showLogin('Seu cadastro está incompleto. Entre em contato com a Dopamina 3D para concluir seus dados.');return;}}
 const sameApp=appShownKey===data.id+':'+data.role&&!$('#appView').classList.contains('hidden');
 profile=data;
 // App já aberta para o mesmo usuário/papel (ex.: volta do seletor de arquivos ou de outro app dispara SIGNED_IN):
 // só atualiza os dados do perfil. NÃO reconstrói a tela, para não perder formulário, anexo e rolagem.
 if(sameApp)return;
 $('#resetPasswordBox')?.classList.add('hidden');$('#loginForm').classList.remove('hidden');showApp();
}
/* ===== extras: pedidos avulsos, edição de pedidos, gerador de contrato ===== */
const X_STATUS={pending:'Aguardando análise',approved:'Aprovado',producing:'Em produção',shipped:'Enviado',completed:'Concluído',cancelled:'Cancelado'};
const X_CHANNEL={whatsapp:'WhatsApp',instagram:'Instagram',loja:'Loja física',site:'Site',outro:'Outro'};
const X_AVAIL={ativo:'Ativo',inativo:'Inativo / sem estoque',fora_catalogo:'Fora do catálogo'};
const xnum=v=>{const t=String(v??'').trim();if(t==='')return NaN;const n=Number(t.replace(/\./g,'').replace(',','.'));return Number.isFinite(n)?n:NaN;};
const xfmt=n=>Number(n||0).toFixed(2).replace('.',',');
const xopt=(o,sel)=>Object.entries(o).map(([k,l])=>`<option value="${k}" ${k===sel?'selected':''}>${escapeHtml(l)}</option>`).join('');
const xfield=(label,html,full)=>`<div class="field ${full?'full':''}"><label>${label}</label>${html}</div>`;
const roundCharm=n=>{const c=Math.round(n*100),i=Math.floor(c/100),f=c-i*100;return n<=0?0:(f===0?i:i+(f<=50?0.5:0.99));};
const isEditable=s=>['pending','approved'].includes(s);
const confirmProduction=()=>confirmDelete('Ao iniciar a produção o pedido não poderá mais ser alterado (itens, quantidades e valores).','Iniciar produção?','Sim, iniciar');

/* ---------- editor de itens (pedido avulso e pedido de revendedor) ---------- */
function itemsEditor(box,{products,free,items,totalEl,roundEl,lockPrice=false}){
  const byId=Object.fromEntries(products.map(p=>[p.id,p]));
  const options=`<option value="">${free?'Outra peça (fora do catálogo)':'Escolha a peça…'}</option><optgroup label="Disponíveis (ativos)">${products.filter(p=>p.active).map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}</optgroup><optgroup label="Inativos / sem estoque">${products.filter(p=>!p.active).map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}</optgroup>`;
  const cols=free?'minmax(150px,1.2fr) minmax(150px,1.4fr) 70px 100px auto':'minmax(200px,2fr) 70px 100px auto';
  const calc=()=>{let sub=0;box.querySelectorAll('.mof-row').forEach(r=>{const q=xnum(r.querySelector('[name=qty]').value),p=xnum(r.querySelector('[name=price]').value);if(q>0&&p>=0)sub+=q*p;});sub=Math.round(sub*100)/100;const rd=roundEl.checked,tot=rd?roundCharm(sub):sub;totalEl.innerHTML=`<span class="muted">Subtotal ${money(sub)}${rd&&tot!==sub?` · arredondamento ${money(tot-sub)}`:''}</span><br><strong style="font-size:1.25rem">Total: ${money(tot)}</strong>`;return {sub,tot};};
  const add=(it={})=>{const r=document.createElement('div');r.className='mof-row';r.style.cssText=`display:grid;grid-template-columns:${cols};gap:8px;margin-bottom:8px;align-items:center`;
    r.innerHTML=`<select name="prod" aria-label="Peça">${options}</select><input name="desc" placeholder="Descrição (cor, detalhes)" maxlength="160" aria-label="Descrição" ${free?'':'hidden'}><input name="qty" type="number" min="1" step="1" value="${it.quantity||1}" aria-label="Quantidade"><input name="price" inputmode="decimal" placeholder="Preço" value="${it.unit_price!=null?xfmt(it.unit_price):''}" aria-label="Preço unitário" ${lockPrice?"readonly":""}><button type="button" class="btn secondary" aria-label="Remover item">×</button>`;
    const sel=r.querySelector('[name=prod]'),desc=r.querySelector('[name=desc]');if(it.product_id&&byId[it.product_id])sel.value=it.product_id;desc.value=it.description||(byId[it.product_id]?.name||'');
    sel.onchange=()=>{const p=byId[sel.value];if(p){desc.value=p.name;r.querySelector('[name=price]').value=xfmt(p.price);}calc();};
    r.querySelectorAll('input').forEach(i=>i.oninput=calc);r.querySelector('button').onclick=()=>{if(box.children.length>1){r.remove();calc();}};box.append(r);};
  (items&&items.length?items:[{}]).forEach(add);roundEl.onchange=calc;calc();
  return {add,calc,get(){const out=[];for(const r of box.querySelectorAll('.mof-row')){const pid=r.querySelector('[name=prod]').value,desc=r.querySelector('[name=desc]').value.trim(),q=xnum(r.querySelector('[name=qty]').value),p=xnum(r.querySelector('[name=price]').value);
    if(!pid&&!desc&&!r.querySelector('[name=price]').value)continue;if((!free&&!pid)||(free&&!pid&&!desc)||!(q>=1)||!Number.isInteger(q)||!(p>=0))throw new Error('Confira peça, quantidade e preço de cada item.');
    out.push({product_id:pid||null,description:desc||byId[pid]?.name||'',availability:pid?(byId[pid]?.active?'ativo':'inativo'):'fora_catalogo',quantity:q,unit_price:Math.round(p*100)/100});}
    if(!out.length)throw new Error('Adicione ao menos uma peça.');return out;}};
}

/* ---------- 1) PEDIDOS AVULSOS ---------- */
const _ordersBase=orders;
orders=async function(own){await _ordersBase(own);if(!own&&['admin','collaborator'].includes(profile.role)&&currentTab==='orders'){await decorateOrders();await manualOrders();}};

async function decorateOrders(){
  const {data}=await sb.from('orders').select('id,status');const ed=new Set((data||[]).filter(o=>isEditable(o.status)).map(o=>o.id));
  $('#content').querySelectorAll('[data-order-details]').forEach(b=>{if(!ed.has(b.dataset.orderDetails)||b.nextElementSibling?.dataset.orderEdit)return;const e=document.createElement('button');e.type='button';e.className='btn secondary';e.textContent='Editar';e.dataset.orderEdit=b.dataset.orderDetails;e.onclick=()=>regularOrderEdit(b.dataset.orderDetails);b.after(e);});
}

async function regularOrderEdit(id){
  $('#orderEditCard')?.remove();
  const [o,it,pr]=await Promise.all([sb.from('orders').select('id,status,total,order_type,reseller_id,profiles(full_name,email)').eq('id',id).maybeSingle(),sb.from('order_items').select('product_id,quantity,unit_price').eq('order_id',id),sb.from('products').select('id,name,price,wholesale_price,active').order('name')]);
  if(o.error||!o.data)return toast('Pedido não encontrado.');if(!isEditable(o.data.status))return toast('Este pedido já está em produção e não pode mais ser alterado.');
  const resellerEdit=profile.role==='reseller';if(resellerEdit&&o.data.reseller_id!==profile.id)return toast('Você não pode editar este pedido.');
  const editorProducts=(pr.data||[]).map(p=>resellerEdit?{...p,price:Number(p.wholesale_price??p.price??0)}:p);
  const c=document.createElement('div');c.className='card section';c.id='orderEditCard';
  c.innerHTML=`<div class="row between"><div><h2>Editar pedido #${id.slice(0,8)}</h2><span class="muted">${escapeHtml(o.data.profiles?.full_name||o.data.profiles?.email||'')} · só é possível alterar enquanto o pedido não estiver em produção.${resellerEdit?' Os preços são de atacado e não podem ser editados.':''}</span></div><button type="button" class="btn secondary" id="oeCancel">Cancelar</button></div><div id="oeItems" style="margin-top:12px"></div><button type="button" class="btn secondary" id="oeAdd">+ Adicionar peça</button><div class="row between" style="margin-top:12px">${resellerEdit?'':'<label><input type="checkbox" id="oeRound" checked> Arredondar total (centavos para ,50 ou ,99)</label>'}<div id="oeTotal" style="text-align:right"></div></div><div class="row" style="justify-content:flex-end;margin-top:10px"><button class="btn" id="oeSave" type="button">Salvar alterações</button></div>`;
  $('#content').prepend(c);c.scrollIntoView({block:'start'});
  const editorItems=resellerEdit?(it.data||[]).map(item=>({...item,unit_price:editorProducts.find(p=>p.id===item.product_id)?.price??item.unit_price})):(it.data||[]);const ed=itemsEditor($('#oeItems'),{products:editorProducts,free:false,items:editorItems,totalEl:$('#oeTotal'),roundEl:resellerEdit?{get checked(){return false},set onchange(v){}}:$('#oeRound'),lockPrice:resellerEdit});
  $('#oeAdd').onclick=()=>ed.add();$('#oeCancel').onclick=()=>c.remove();
  $('#oeSave').onclick=async()=>{let items;try{items=ed.get();}catch(e){return toast(e.message);}if(resellerEdit&&o.data.order_type==='purchase'){const totalUnits=items.reduce((sum,x)=>sum+x.quantity,0);if(items.some(x=>x.quantity<10))return toast('Na compra, cada modelo deve ter no mínimo 10 unidades.');if(totalUnits<30)return toast('A compra exige no mínimo 30 unidades no pedido.');}const b=$('#oeSave');b.disabled=true;
    const r=await sb.rpc('edit_order',{p_order:id,p_items:items.map(i=>({product_id:i.product_id,quantity:i.quantity,unit_price:i.unit_price})),p_round:resellerEdit?false:$('#oeRound').checked});
    if(r.error){toast(r.error.message);b.disabled=false;return;}toast('Pedido atualizado.');await orders(resellerEdit);};
}

async function manualOrders(){
  const {data,error}=await sb.from('manual_orders').select('*,manual_order_items(product_id,description,availability,quantity,unit_price)').order('created_at',{ascending:false});
  if(error)throw error;if(currentTab!=='orders')return;
  const manual=data||[],cards=[...($('#content .grid')?.children||[])];
  const regularResult=await sb.from('orders').select('id,status');if(regularResult.error)throw regularResult.error;
  const regular=regularResult.data||[];
  if(cards.length>=4){cards[0].querySelector('strong').textContent=regular.length+manual.length;cards[1].querySelector('strong').textContent=regular.filter(x=>x.status==='pending').length+manual.filter(x=>x.status==='pending').length;cards[2].querySelector('strong').textContent=regular.filter(x=>x.status==='producing').length+manual.filter(x=>x.status==='producing').length;cards[3].querySelector('strong').textContent=regular.filter(x=>x.status==='completed').length+manual.filter(x=>x.status==='completed').length;}
  $('#manualOrdersCard')?.remove();const adm=profile.role==='admin',byId=Object.fromEntries((data||[]).map(o=>[o.id,o]));
  const rows=(data||[]).map(o=>{const its=o.manual_order_items||[];return `<tr><td>#${o.id.slice(0,8)}</td><td><b>${escapeHtml(o.customer_name)}</b><br><small class="muted">${escapeHtml([o.customer_phone,o.customer_email].filter(Boolean).join(' · '))}</small></td><td>${date(o.created_at?.slice(0,10))}<br><small class="muted">${escapeHtml(X_CHANNEL[o.channel]||o.channel)}</small></td><td>${its.length} item(ns)<br><small class="muted">${escapeHtml(its.map(i=>i.quantity+'× '+i.description).join(', ').slice(0,90))}</small></td><td>${money(o.total)}${o.subtotal!=null&&Number(o.subtotal)!==Number(o.total)?`<br><small class="muted">subtotal ${money(o.subtotal)}</small>`:''}</td><td><button type="button" class="status ${o.payment_status==='paid'?'ok':'wait'}" data-xpay="${o.id}" data-paid="${o.payment_status==='paid'?1:0}" title="Alternar pagamento">${o.payment_status==='paid'?'Pago':'Pendente'}</button></td><td><select data-xstatus="${o.id}" data-prev="${o.status}" aria-label="Status">${xopt(X_STATUS,o.status)}</select></td><td><div class="order-actions"><button type="button" class="btn secondary" data-xdetail="${o.id}">Itens</button>${isEditable(o.status)?`<button type="button" class="btn secondary" data-xedit="${o.id}">Editar</button>`:''}${adm?`<button type="button" class="btn secondary" data-xdel="${o.id}" aria-label="Excluir pedido">Excluir</button>`:''}</div></td></tr><tr class="hidden" data-xrow="${o.id}"><td colspan="8">${its.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Peça</th><th>Situação no catálogo</th><th>Qtd.</th><th>Preço un.</th><th>Subtotal</th></tr></thead><tbody>${its.map(i=>`<tr><td>${escapeHtml(i.description)}</td><td>${escapeHtml(X_AVAIL[i.availability]||'')}</td><td>${i.quantity}</td><td>${money(i.unit_price)}</td><td>${money(i.quantity*i.unit_price)}</td></tr>`).join('')}</tbody></table></div>`:'Sem itens.'}${o.notes?`<p class="muted">Obs.: ${escapeHtml(o.notes)}</p>`:''}</td></tr>`;}).join('');
  const card=document.createElement('div');card.className='card section';card.id='manualOrdersCard';
  card.innerHTML=`<div class="row between"><div><h2>Pedidos avulsos</h2><span class="muted">Clientes que pedem por WhatsApp, Instagram ou na loja, com ou sem cadastro no site. Podem ser editados até entrar em produção.</span></div><button class="btn" id="newManualOrder" type="button">+ Novo pedido avulso</button></div><div id="manualOrderForm"></div><div class="table-wrap"><table class="table"><thead><tr><th>Pedido</th><th>Cliente</th><th>Data / canal</th><th>Itens</th><th>Total</th><th>Pagamento</th><th>Status</th><th>Ações</th></tr></thead><tbody>${rows||'<tr><td colspan="8" class="empty">Nenhum pedido avulso.</td></tr>'}</tbody></table></div>`;
  $('#content').append(card);
  $('#newManualOrder').onclick=()=>manualOrderForm();
  card.querySelectorAll('[data-xedit]').forEach(b=>b.onclick=()=>manualOrderForm(byId[b.dataset.xedit]));
  card.querySelectorAll('[data-xdetail]').forEach(b=>b.onclick=()=>card.querySelector(`[data-xrow="${b.dataset.xdetail}"]`).classList.toggle('hidden'));
  card.querySelectorAll('[data-xstatus]').forEach(s=>s.onchange=async()=>{if(s.value==='producing'&&!await confirmProduction()){s.value=s.dataset.prev;return;}const r=await sb.from('manual_orders').update({status:s.value}).eq('id',s.dataset.xstatus).select('id').maybeSingle();if(r.error||!r.data){toast('Falha ao atualizar status.');return manualOrders();}toast('Status atualizado.');manualOrders();});
  card.querySelectorAll('[data-xpay]').forEach(b=>b.onclick=async()=>{const paid=b.dataset.paid==='1',r=await sb.from('manual_orders').update({payment_status:paid?'pending':'paid'}).eq('id',b.dataset.xpay).select('id').maybeSingle();if(r.error||!r.data)return toast('Falha ao atualizar pagamento.');toast(paid?'Pagamento marcado como pendente.':'Pagamento confirmado.');manualOrders();});
  card.querySelectorAll('[data-xdel]').forEach(b=>b.onclick=async()=>{if(!await confirmDelete('O pedido avulso e seus itens serão apagados.','Excluir pedido?'))return;const r=await sb.from('manual_orders').delete().eq('id',b.dataset.xdel);if(r.error)return toast('Falha ao excluir: '+r.error.message);toast('Pedido excluído.');manualOrders();});
}

async function manualOrderForm(order){
  const {data:prods,error}=await sb.from('products').select('id,name,price,active').order('name');if(error)return toast('Erro ao carregar produtos: '+error.message);
  const host=$('#manualOrderForm'),ed=!!order,v=k=>escapeHtml(order?.[k]??'');
  host.innerHTML=`<form id="mof" class="form-grid section" autocomplete="off"><div class="field full"><h3>${ed?'Editar pedido #'+order.id.slice(0,8):'Novo pedido avulso'}</h3></div>${xfield('Nome do cliente *',`<input name="customer_name" required maxlength="120" value="${v('customer_name')}">`)}${xfield('WhatsApp',`<input name="customer_phone" maxlength="30" inputmode="tel" value="${v('customer_phone')}">`)}${xfield('E-mail (opcional)',`<input name="customer_email" type="email" maxlength="254" value="${v('customer_email')}">`)}${xfield('Canal',`<select name="channel">${xopt(X_CHANNEL,order?.channel||'whatsapp')}</select>`)}${ed?'':xfield('Status',`<select name="status">${xopt(X_STATUS,'pending')}</select>`)}${ed?'':xfield('Pagamento','<select name="payment_status"><option value="pending">Pendente</option><option value="paid">Pago</option></select>')}
   <div class="field full"><label>Itens do pedido *</label><div id="mofItems"></div><button type="button" class="btn secondary" id="mofAdd">+ Adicionar peça</button></div>${xfield('Observações',`<textarea name="notes" maxlength="1000" rows="2">${v('notes')}</textarea>`,true)}
   <div class="field full row between"><label><input type="checkbox" id="mofRound" ${order&&order.round_total===false?'':'checked'}> Arredondar total (centavos para ,50 ou ,99)</label><div id="mofTotal" style="text-align:right"></div></div>
   <div class="field full row" style="justify-content:flex-end"><button type="button" class="btn secondary" id="mofCancel">Cancelar</button><button class="btn" id="mofSave">${ed?'Salvar alterações':'Salvar pedido'}</button></div></form>`;
  const e=itemsEditor($('#mofItems'),{products:prods||[],free:true,items:order?.manual_order_items,totalEl:$('#mofTotal'),roundEl:$('#mofRound')});
  $('#mofAdd').onclick=()=>e.add();$('#mofCancel').onclick=()=>{host.innerHTML='';};
  $('#mof').onsubmit=async ev=>{ev.preventDefault();const f=new FormData(ev.target);let items;try{items=e.get();}catch(err){return toast(err.message);}
   const btn=$('#mofSave'),rd=$('#mofRound').checked;btn.disabled=true;
   try{const sub=Math.round(items.reduce((a,i)=>a+i.quantity*i.unit_price,0)*100)/100,total=rd?roundCharm(sub):sub,fields={customer_name:f.get('customer_name').trim(),customer_phone:f.get('customer_phone').trim()||null,customer_email:f.get('customer_email').trim()||null,channel:f.get('channel'),notes:f.get('notes').trim()||null};
    if(ed){const r=await sb.rpc('edit_manual_order',{p_order:order.id,p_fields:fields,p_items:items,p_round:rd});if(r.error)throw r.error;toast('Pedido atualizado.');}
    else{const o=await sb.from('manual_orders').insert({...fields,status:f.get('status'),payment_status:f.get('payment_status'),total,subtotal:sub,round_total:rd}).select('id').single();if(o.error)throw o.error;
     const it=await sb.from('manual_order_items').insert(items.map(i=>({...i,order_id:o.data.id})));if(it.error){await sb.from('manual_orders').delete().eq('id',o.data.id);throw it.error;}toast('Pedido avulso salvo.');}
    await manualOrders();
   }catch(err){toast('Falha ao salvar: '+err.message);btn.disabled=false;}};
  host.scrollIntoView({block:'nearest'});
}

/* ---------- 2) CONTRATOS ---------- */
const _contractsBase=contracts;
contracts=async function(own){await _contractsBase(own);if(own||profile.role!=='admin'||currentTab!=='contracts')return;
  const a=$('#addContract'),actions=$('.contract-header-actions');if(a&&actions&&!$('#genContract')){a.insertAdjacentHTML('beforebegin','<button class="btn" id="genContract" type="button">+ Gerar contrato</button>');$('#genContract').onclick=()=>contractForm();}
  const r=await sb.from('contracts').select('id,file_path,status,reseller_id,contract_data(data)');if(r.error)return;
  $('#content').querySelectorAll('[data-contract]').forEach(b=>{const c=(r.data||[]).find(x=>x.file_path===b.dataset.contract),cd=Array.isArray(c?.contract_data)?c.contract_data[0]:c?.contract_data;
    if(!c||!cd||['terminated','closed','ended','cancelled'].includes(String(c.status).toLowerCase())||b.nextElementSibling?.dataset.editContract)return;
    const e=document.createElement('button');e.type='button';e.className='btn secondary';e.textContent='Editar dados';e.dataset.editContract=c.id;e.onclick=()=>contractForm({id:c.id,reseller_id:c.reseller_id,file_path:c.file_path,status:c.status,data:cd.data});b.after(e);});
};

const xclean=s=>String(s??'').replace(/[^\u0009\u000a\u0020-\u007e\u00a0-\u00ff\u2013\u2014\u2018\u2019\u201c\u201d\u2022\u2026\u20ac]/g,'?');
const xrs=n=>'R$ '+Number(n||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const xdoc=(v,pj)=>{const d=String(v).replace(/\D/g,'');return pj?(d.length===14?d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,'$1.$2.$3/$4-$5'):null):(d.length===11?d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,'$1.$2.$3-$4'):null);};
const xdlong=iso=>new Date(iso+'T12:00:00').toLocaleDateString('pt-BR',{day:'numeric',month:'long',year:'numeric'});
const xdshort=iso=>new Date(iso+'T12:00:00').toLocaleDateString('pt-BR');
const GROUPS={chaveiros:'Chaveiros',sensoriais:'Solapas e modelos sensoriais',outros:'Outros',amostras:'Amostras'};
const GROUP_TOTAL={chaveiros:'Total de chaveiros',sensoriais:'Total de modelos sensoriais',outros:'Total de outros'};
const norm=s=>String(s||'').trim().toLowerCase();

async function contractForm(edit){
  $('#contractGen')?.remove();
  const [st,pr,ci]=await Promise.all([sb.from('contract_settings').select('data').eq('id',1).maybeSingle(),sb.from('products').select('id,name,price').eq('active',true).order('name'),sb.from('product_internal_data').select('product_id,cost_price')]);
  const S=st.data?.data||{},cat=(pr.data||[]).map(p=>({name:p.name,price:Number(p.price||0),cost:Number((ci.data||[]).find(c=>c.product_id===p.id)?.cost_price||0)}));
  const today=new Date().toISOString().slice(0,10),D=edit?.data||{kind:'pj',cdate:today,shipno:'1',gender:'f',items:[]};
  const f=document.createElement('div');f.className='card section';f.id='contractGen';
  f.innerHTML=`<div class="row between"><h2>${edit?'Editar dados do contrato':'Gerar contrato de consignação'}</h2><button type="button" class="btn secondary" id="cgCancel">Cancelar</button></div><p class="muted">${edit?'Altera os dados e gera o PDF novamente. O convite e o e-mail de acesso não mudam.':'Gera o PDF no seu modelo, salva em Contratos e envia o convite de acesso ao revendedor.'}</p>
  <form id="cg" class="form-grid" autocomplete="off">${xfield('Tipo de revendedor',`<select name="kind" ${edit?'disabled':''}><option value="pj" ${D.kind==='pj'?'selected':''}>Pessoa jurídica (PJ)</option><option value="pf" ${D.kind==='pf'?'selected':''}>Pessoa física (PF)</option></select>`)}
   <div id="cgFields" class="form-grid" style="grid-column:1/-1"></div>
   ${xfield('Remessa nº',`<input name="shipno" maxlength="10" value="${escapeHtml(D.shipno||'1')}">`)}${xfield('Data do contrato',`<input type="date" name="cdate" value="${D.cdate||today}">`)}
   <div class="field full"><label>Anexo I — peças da remessa</label><div class="table-wrap"><table class="table" id="cgItems"><thead><tr><th>Grupo</th><th>Modelo</th><th>Qtd.</th><th>Repasse (un.)</th><th>Varejo sugerido (un.)</th><th></th></tr></thead><tbody></tbody></table></div><datalist id="cgCat">${cat.map(p=>`<option value="${escapeHtml(p.name)}">`).join('')}</datalist><button type="button" class="btn secondary" id="cgAdd">+ Adicionar peça</button> <small class="muted">Peças ativas do catálogo preenchem repasse e varejo sozinhas (confira os valores).</small></div>
   <div class="field full"><div id="cgSum" style="background:#C6F432;color:#14110F;border-radius:14px;padding:16px 20px;display:flex;flex-wrap:wrap;gap:18px;align-items:center;justify-content:space-between"></div></div>
   <details class="field full"><summary><b>Dados do CONSIGNANTE</b> <small class="muted">(salvos uma vez, só o administrador acessa)</small></summary><div class="form-grid" style="margin-top:8px">${xfield('Nome completo',`<input name="s_name" maxlength="120" value="${escapeHtml(S.name||'')}">`)}${xfield('Qualificação',`<input name="s_qual" maxlength="80" placeholder="brasileiro, solteiro" value="${escapeHtml(S.qual||'')}">`)}${xfield('CPF',`<input name="s_doc" maxlength="14" value="${escapeHtml(S.doc||'')}">`)}${xfield('Endereço comercial',`<input name="s_addr" maxlength="240" value="${escapeHtml(S.addr||'')}">`)}${xfield('E-mail',`<input name="s_email" maxlength="254" value="${escapeHtml(S.email||'')}">`)}${xfield('WhatsApp',`<input name="s_wa" maxlength="30" value="${escapeHtml(S.wa||'')}">`)}${xfield('Instagram',`<input name="s_ig" maxlength="60" value="${escapeHtml(S.ig||'@dopamina_3D')}">`)}${xfield('Chave PIX (Anexo II)',`<input name="s_pix" maxlength="120" value="${escapeHtml(S.pix||'')}">`)}</div></details>
   <div class="field full"><button class="btn" id="cgGo">${edit?'Salvar e gerar PDF novamente':'Gerar contrato e enviar convite'}</button></div></form>`;
  $('#content').prepend(f);f.scrollIntoView({block:'start'});
  const el=n=>f.querySelector(`[name=${n}]`),kindSel=el('kind');
  /* campos mudam conforme PF ou PJ */
  const KEYS=['name','trade','doc','email','wa','addr','rep','repdoc','role','gender'];
  const read=()=>Object.fromEntries(KEYS.filter(k=>el(k)).map(k=>[k,el(k).value]));
  const renderFields=(kind,v)=>{const pj=kind==='pj',I=(n,l,extra='')=>xfield(l,`<input name="${n}" value="${escapeHtml(v[n]||'')}" maxlength="${n==='addr'?240:120}" ${extra}>`,n==='addr');
    $('#cgFields').innerHTML=pj?I('name','Razão social *','required')+I('trade','Nome fantasia')+I('doc','CNPJ *','inputmode="numeric" maxlength="18"')+I('email','E-mail (será o login do convite) *',`type="email" ${edit?'readonly':''}`)+I('wa','WhatsApp *','inputmode="tel"')+I('addr','Endereço da sede *')+I('rep','Representante legal *')+I('repdoc','CPF do representante *','inputmode="numeric" maxlength="14"')+I('role','Cargo / qualidade *','placeholder="ex.: sócio-administrador"')
     :I('name','Nome completo *','required')+I('doc','CPF *','inputmode="numeric" maxlength="14"')+I('email','E-mail (será o login do convite) *',`type="email" ${edit?'readonly':''}`)+I('wa','WhatsApp *','inputmode="tel"')+I('addr','Endereço residencial *')+xfield('Tratamento no contrato',`<select name="gender"><option value="m" ${v.gender==='m'?'selected':''}>Masculino (o consignatário)</option><option value="f" ${v.gender==='f'?'selected':''}>Feminino (a consignatária)</option></select>`);};
  renderFields(D.kind,{...D,gender:D.gender||'m'});kindSel.onchange=()=>renderFields(kindSel.value,read());
  /* tabela do Anexo I: começa vazia */
  const tb=f.querySelector('#cgItems tbody'),pieces=[];
  const sum=()=>{let t=0,q=0,vt=0,am=0;tb.querySelectorAll('tr').forEach(r=>{const g=r.querySelector('[name=g]').value,n=xnum(r.querySelector('[name=q]').value)||0,rp=xnum(r.querySelector('[name=r]').value)||0,vr=xnum(r.querySelector('[name=v]').value)||0;if(g==='amostras'){am+=n;return;}t+=n*rp;q+=n;vt+=n*vr;});
    $('#cgSum').innerHTML=`<div><div style="font-size:.8rem;letter-spacing:.08em;text-transform:uppercase;opacity:.75">Total de repasse</div><div style="font-size:2rem;font-weight:700;line-height:1.1">${money(t)}</div></div><div><div style="font-size:.8rem;letter-spacing:.08em;text-transform:uppercase;opacity:.75">Peças consignadas</div><div style="font-size:2rem;font-weight:700;line-height:1.1">${q}</div></div><div style="font-size:.9rem">Varejo sugerido total: <b>${money(vt)}</b><br>Amostras (fora do repasse): <b>${am}</b></div>`;};
  const add=(d={g:'chaveiros',n:'',q:1,r:'',v:''})=>{const tr=document.createElement('tr');tr.innerHTML=`<td><select name="g">${xopt(GROUPS,d.g)}</select></td><td><input name="n" list="cgCat" maxlength="80" value="${escapeHtml(d.n)}" placeholder="Modelo" aria-label="Modelo"><small class="muted cat-hint"></small></td><td><input name="q" type="number" min="1" value="${d.q}" style="width:70px" aria-label="Quantidade"></td><td><input name="r" inputmode="decimal" value="${d.r===''?'':xfmt(d.r)}" placeholder="0,00" style="width:90px" aria-label="Repasse"></td><td><input name="v" inputmode="decimal" value="${d.v===''?'':xfmt(d.v)}" placeholder="0,00" style="width:90px" aria-label="Varejo sugerido"></td><td><button type="button" class="btn secondary" aria-label="Remover">×</button></td>`;
    tr.querySelectorAll('input,select').forEach(i=>i.oninput=sum);
    tr.querySelector('[name=n]').onchange=e=>{const p=cat.find(x=>norm(x.name)===norm(e.target.value)),h=tr.querySelector('.cat-hint');if(!p){h.textContent='';return;}const r=tr.querySelector('[name=r]'),v=tr.querySelector('[name=v]');if(!r.value&&p.cost>0)r.value=xfmt(p.cost);if(!v.value&&p.price>0)v.value=xfmt(p.price);h.textContent=' ✓ do catálogo';sum();};
    tr.querySelector('button').onclick=()=>{tr.remove();sum();};tb.append(tr);};
  (D.items&&D.items.length?D.items:[undefined]).forEach(i=>add(i));sum();f.querySelector('#cgAdd').onclick=()=>{add();sum();};f.querySelector('#cgCancel').onclick=()=>f.remove();
  f.querySelector('#cg').onsubmit=async e=>{e.preventDefault();const b=f.querySelector('#cgGo');b.disabled=true;try{await generateContract(f,e.target,edit,kindSel.value);}catch(err){toast('Falha: '+(err.message||err));b.disabled=false;}};
}

async function generateContract(f,form,edit,kind){
  const g=n=>form.elements[n]?.value.trim()||'',isPJ=kind==='pj',email=g('email').toLowerCase(),doc=xdoc(g('doc'),isPJ),repdoc=isPJ?xdoc(g('repdoc'),false):'';
  if(g('name').length<3)throw new Error(isPJ?'Informe a razão social.':'Informe o nome completo.');
  if(!doc)throw new Error(isPJ?'CNPJ inválido (14 dígitos).':'CPF inválido (11 dígitos).');
  if(!email||!g('wa')||!g('addr'))throw new Error('Preencha e-mail, WhatsApp e endereço.');
  if(isPJ&&(!g('rep')||!repdoc||!g('role')))throw new Error('Informe representante legal, CPF do representante e cargo.');
  const S={name:g('s_name'),qual:g('s_qual'),doc:g('s_doc'),addr:g('s_addr'),email:g('s_email'),wa:g('s_wa'),ig:g('s_ig'),pix:g('s_pix')};
  if(!S.name||!S.doc||!S.addr)throw new Error('Preencha os dados do CONSIGNANTE (nome, CPF e endereço).');
  const items=[...f.querySelectorAll('#cgItems tbody tr')].map(r=>({g:r.querySelector('[name=g]').value,n:r.querySelector('[name=n]').value.trim(),q:xnum(r.querySelector('[name=q]').value),r:xnum(r.querySelector('[name=r]').value),v:xnum(r.querySelector('[name=v]').value)})).filter(i=>i.n);
  if(!items.length)throw new Error('Adicione ao menos uma peça no Anexo I.');
  if(items.some(i=>!(i.q>=1)||!(i.r>=0)||!(i.v>=0)))throw new Error('Confira quantidade, repasse e varejo sugerido de cada peça.');
  const data={kind,name:g('name'),trade:isPJ?g('trade'):'',doc,email,wa:g('wa'),addr:g('addr'),rep:isPJ?g('rep'):'',repdoc,role:isPJ?g('role'):'',gender:isPJ?'f':(g('gender')||'m'),shipno:g('shipno')||'1',cdate:g('cdate')||new Date().toISOString().slice(0,10),items};
  if(edit&&edit.status!=='pending_signature'&&!await confirmDelete('Este contrato não está mais como “aguardando assinatura”. Gerar de novo substitui o PDF atual (o histórico não é guardado).','Substituir contrato?','Sim, substituir'))throw new Error('Edição cancelada.');
  const bytes=await buildContractPdf(data,S);
  if(pdfFontFallback)toast('Aviso: a fonte Poppins não carregou; o PDF usou a fonte padrão.');
  let uid=edit?.reseller_id;
  if(!edit){const inv=await sb.functions.invoke('admin-users',{body:{action:'invite',email,full_name:data.name,role:'reseller'}});
    if(inv.error||inv.data?.error)throw new Error(inv.data?.error||'Não foi possível enviar o convite: '+inv.error.message);
    uid=inv.data.user_id;if(!uid)throw new Error('Convite enviado, mas o servidor não devolveu o ID. Atualize a função admin-users e anexe o PDF manualmente.');}
  const key=`${uid}/${crypto.randomUUID()}.pdf`,up=await sb.storage.from('contracts').upload(key,new Blob([bytes],{type:'application/pdf'}),{contentType:'application/pdf'});
  if(up.error)throw new Error((edit?'':'Convite enviado, mas ')+'o PDF não foi salvo: '+up.error.message);
  const title='Contrato de consignação — '+data.name;
  if(edit){const u=await sb.from('contracts').update({title,file_path:key}).eq('id',edit.id).select('id').maybeSingle();if(u.error||!u.data)throw new Error('PDF novo salvo, mas o registro não foi atualizado.');
    await sb.from('contract_data').upsert({contract_id:edit.id,data});await sb.storage.from('contracts').remove([edit.file_path]);toast('Contrato atualizado.');}
  else{const c=await sb.from('contracts').insert({reseller_id:uid,title,file_path:key,status:'pending_signature'}).select('id').single();if(c.error)throw new Error('PDF salvo, mas o registro falhou: '+c.error.message);
    await sb.from('contract_data').insert({contract_id:c.data.id,data});
    const desc=items.map(i=>`${i.q}× ${i.n} (repasse ${money(i.r)})`).join('; ');
    const sh=await sb.from('shipments').insert({reseller_id:uid,shipment_date:data.cdate,status:'preparing',shipment_type:'consignment',contract_id:c.data.id,description:desc}).select('id').single();
    if(sh.error)throw new Error('Contrato e convite foram criados, mas a remessa inicial não foi registrada: '+sh.error.message);
    toast('Contrato gerado, convite enviado e remessa inicial criada para '+email+'.');}
  await sb.from('contract_settings').upsert({id:1,data:S,updated_at:new Date().toISOString()});
  await contracts(false);await openPrivateStorageFile('contracts',key);
}

const loadScriptOnce=url=>new Promise((ok,no)=>{if([...document.scripts].some(x=>x.src===url))return ok();const t=document.createElement('script');t.src=url;t.onload=ok;t.onerror=()=>no(new Error('Falha ao carregar '+url));document.head.append(t);});
let _pdfLibP;const loadPdfLib=()=>_pdfLibP||(_pdfLibP=(window.PDFLib?Promise.resolve():loadScriptOnce('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js')).catch(e=>{_pdfLibP=null;throw new Error('Não foi possível carregar o gerador de PDF.');}));
let pdfFontFallback=false;
async function loadBrandFonts(doc){try{await loadScriptOnce('https://cdn.jsdelivr.net/npm/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js');doc.registerFontkit(window.fontkit);
  const get=async n=>{const r=await fetch('assets/fonts/'+n);if(!r.ok)throw new Error(n+' '+r.status);return new Uint8Array(await r.arrayBuffer());};
  const [r,m,b]=await Promise.all(['Poppins-Regular.ttf','Poppins-Medium.ttf','Poppins-Bold.ttf'].map(get));
  return {F:await doc.embedFont(r,{subset:true}),M:await doc.embedFont(m,{subset:true}),B:await doc.embedFont(b,{subset:true}),custom:true};
 }catch(e){console.warn('Fonte Poppins indisponível, usando Helvetica:',e);return null;}}
const BOLD_TERMS=['preço de repasse','Termo de Remessa e Acerto','contrato estimatório','30 dias','PIX','2 dias úteis','5 dias úteis','multa de 2%','juros de 1% ao mês','10 dias','Não há qualquer ônus para a CONSIGNATÁRIA pelas peças não vendidas','nunca repassa menos que o preço de repasse.','perdida, furtada, danificada ou não puder ser devolvida inteira, mesmo sem culpa da CONSIGNATÁRIA','defeito de fabricação','não cobre','15 dias','10% do valor da remessa vigente (mínimo de R$ 100,00)','WhatsApp ou e-mail','Goiânia – GO'];
const BOLD_RE=new RegExp(BOLD_TERMS.sort((a,b)=>b.length-a.length).map(t=>t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'g');
/* concordância: CONSIGNATÁRIA (feminino) ou CONSIGNATÁRIO (masculino), com a/à/da/pela */
const toMasc=t=>t.replace(/(?<![\p{L}])(à|da|a|A|na|pela)\s+CONSIGNATÁRIA/gu,(m,a)=>({'à':'ao','da':'do','a':'o','A':'O','na':'no','pela':'pelo'}[a])+' CONSIGNATÁRIO').replace(/CONSIGNATÁRIA/g,'CONSIGNATÁRIO').replace(/\bobrigada\b/g,'obrigado');

async function buildContractPdf(d,S){
  await loadPdfLib();const {PDFDocument,StandardFonts,rgb}=PDFLib,doc=await PDFDocument.create();
  let fonts=await loadBrandFonts(doc);pdfFontFallback=!fonts;const custom=!!fonts;
  if(!fonts){const h=await doc.embedFont(StandardFonts.Helvetica),hb=await doc.embedFont(StandardFonts.HelveticaBold);fonts={F:h,M:hb,B:hb};}
  const {F,M,B}=fonts,K=custom?1:1.035,fem=d.kind==='pj'||d.gender!=='m',G=t=>fem?t:toMasc(t),CA=fem?'CONSIGNATÁRIA':'CONSIGNATÁRIO';
  const W=595.28,H=841.89,MX=50,CW=W-2*MX,LIME=rgb(.776,.957,.196),INK=rgb(.078,.067,.059),CREAM=rgb(.957,.945,.918),PAPER=rgb(.969,.961,.937),PINK=rgb(1,.239,.545),GREY=rgb(.42,.4,.37),pages=[];let pg,y;
  const SQ=[[50,45],[72,45],[94,45],[116,45],[50,67],[50,89],[138,89],[50,111],[138,111],[50,133],[138,133],[50,155],[138,155],[50,177],[72,177],[94,177],[116,177]];
  const logo=(x,top,h)=>{const s=h/150;SQ.forEach(([a,b])=>pg.drawRectangle({x:x+(a-50)*s,y:top-(b-45)*s-18*s,width:18*s,height:18*s,color:INK}));pg.drawRectangle({x:x+(146-50)*s,y:top-(59-45)*s-18*s,width:18*s,height:18*s,color:PINK});return 114*s;};
  const spaced=(t,x,yy,size,sp)=>{for(const ch of xclean(t)){pg.drawText(ch,{x,y:yy,size,font:F,color:GREY});x+=F.widthOfTextAtSize(ch,size)+sp;}};
  const newPage=()=>{pg=doc.addPage([W,H]);pages.push(pg);const hh=78;pg.drawRectangle({x:0,y:H-hh,width:W,height:hh,color:CREAM});pg.drawRectangle({x:W-30,y:H-hh,width:30,height:hh,color:INK});
    const lw=logo(MX,H-14,hh-28),lx=MX+lw+18,ww=F.widthOfTextAtSize('dopamina',25);pg.drawText('dopamina',{x:lx,y:H-hh+38,size:25,font:F,color:INK});pg.drawRectangle({x:lx+ww+7,y:H-hh+31,width:36,height:28,color:LIME});pg.drawText('3d',{x:lx+ww+7+9,y:H-hh+38,size:20,font:M,color:INK});
    spaced('UMA DOSE POR CAMADA, UM VÍCIO POR PEÇA.',lx,H-hh+15,5.4,1.5);pg.drawRectangle({x:0,y:H-hh-4,width:W,height:4,color:LIME});y=H-hh-38;};
  const need=h=>{if(y-h<62)newPage();};
  const tok=s=>xclean(s).split(/(\*\*[^*]+\*\*)/).filter(Boolean).flatMap(p=>{const b=p.startsWith('**');return(b?p.slice(2,-2):p).split(/(\s+)/).filter(Boolean).map(w=>({w,b}));});
  const isWs=w=>/^\s+$/.test(w);
  const lay=(text,size,width,bold)=>{const lines=[];let cur=[],wd=0;const close=()=>{while(cur.length&&isWs(cur[cur.length-1].w))cur.pop();if(cur.length)lines.push(cur);cur=[];wd=0;};
    for(const k of tok(text)){const fnt=k.b||bold?B:F,ws=isWs(k.w),w=fnt.widthOfTextAtSize(k.w,size)*K;if(!ws&&wd+w>width&&cur.length)close();if(ws&&!cur.length)continue;cur.push({w:k.w,fw:w,fnt});wd+=w;}close();return lines;};
  /* texto justificado: o espaço extra é dividido entre as palavras; a última linha do parágrafo fica à esquerda */
  const put=(lines,x0,size,lh,color,paged,width,justify)=>{lines.forEach((ln,li)=>{if(paged)need(lh);let extra=0;if(justify&&li<lines.length-1){const nat=ln.reduce((a,k)=>a+k.fw,0),gaps=ln.filter(k=>isWs(k.w)).length;if(gaps&&nat<width)extra=(width-nat)/gaps;}
    let x=x0;for(const k of ln){if(!isWs(k.w))pg.drawText(k.w,{x,y,size,font:k.fnt,color});x+=k.fw+(isWs(k.w)?extra:0);}y-=lh;});};
  const para=(text,o={})=>{const size=o.size||9.5,lh=size*1.62,w=CW-(o.indent||0);put(lay(text,size,w,o.bold),MX+(o.indent||0),size,lh,o.color||INK,true,w,o.justify!==false&&!o.bold);y-=o.gap??5;};
  const box=(text,bar)=>{const size=9.5,lh=size*1.62,pad=13,w=CW-2*pad-6,lines=lay(text,size,w),h=lines.length*lh+2*pad-4;need(h+10);const top=y+size+pad-5;pg.drawRectangle({x:MX,y:top-h,width:CW,height:h,color:PAPER});pg.drawRectangle({x:MX,y:top-h,width:4.5,height:h,color:bar});put(lines,MX+pad+6,size,lh,INK,false,w,true);y=top-h-16;};
  const heading=t=>{need(44);pg.drawRectangle({x:MX,y:y-6,width:4,height:19,color:LIME});pg.drawText(xclean(t),{x:MX+13,y:y,size:9.5,font:M,color:INK});y-=28;};
  const fit=(s,w,size,fnt)=>{s=xclean(s);while(s.length>1&&fnt.widthOfTextAtSize(s,size)>w)s=s.slice(0,-2)+'…';return s;};
  const table=(cols,rows)=>{const RH=14.5,tw=cols.reduce((a,c)=>a+c.w,0),sc=CW/tw;const row=(cells,style)=>{need(RH+2);let x=MX;if(style==='head')pg.drawRectangle({x:MX,y:y-5,width:CW,height:RH,color:INK});else if(style==='total')pg.drawRectangle({x:MX,y:y-5,width:CW,height:RH,color:LIME});else if(style==='zebra')pg.drawRectangle({x:MX,y:y-5,width:CW,height:RH,color:PAPER});
    cells.forEach((c,i)=>{const w=cols[i].w*sc,fnt=style==='head'?M:style==='total'?B:F,sz=style==='head'?6.8:8,t=fit(c,w-8,sz,fnt),tx=cols[i].r?x+w-4-fnt.widthOfTextAtSize(t,sz):x+4;pg.drawText(t,{x:tx,y:y,size:sz,font:fnt,color:style==='head'?rgb(1,1,1):INK});x+=w;});y-=RH;};
    row(cols.map(c=>c.h),'head');rows.forEach((r,i)=>row(r.cells||r,r.style||(i%2?'zebra':'')));y-=10;};
  const sigs=(a,b)=>{need(78);y-=32;pg.drawLine({start:{x:MX,y},end:{x:MX+CW/2-14,y},thickness:1,color:INK});pg.drawLine({start:{x:MX+CW/2+14,y},end:{x:MX+CW,y},thickness:1,color:INK});y-=14;pg.drawText(xclean(a[0]),{x:MX,y,size:7.5,font:M});pg.drawText(fit(b[0],CW/2-14,7.5,M),{x:MX+CW/2+14,y,size:7.5,font:M});y-=11;pg.drawText(xclean(a[1]),{x:MX,y,size:7.5,font:F});pg.drawText(fit(b[1],CW/2-14,7.5,F),{x:MX+CW/2+14,y,size:7.5,font:F});y-=14;};
  /* destaque do total de repasse: caixa escura com o valor em lima */
  const totalBox=(label,sub,value)=>{need(70);const h=54;pg.drawRectangle({x:MX,y:y-h+14,width:CW,height:h,color:INK});pg.drawRectangle({x:MX,y:y-h+14,width:5,height:h,color:LIME});pg.drawText(xclean(label),{x:MX+18,y:y-8,size:9,font:M,color:rgb(1,1,1)});pg.drawText(xclean(sub),{x:MX+18,y:y-24,size:7.5,font:F,color:rgb(.82,.82,.78)});const vs=xclean(value),vw=B.widthOfTextAtSize(vs,22);pg.drawText(vs,{x:MX+CW-18-vw,y:y-18,size:22,font:B,color:LIME});y-=h+10;};
  const T=CONTRACT_TEMPLATE,pj=d.kind==='pj',tradeName=d.trade||d.name;
  newPage();need(60);const title='Contrato de Consignação Mercantil',tw=F.widthOfTextAtSize(title,22);pg.drawRectangle({x:MX-2,y:y-10,width:tw+20,height:36,color:LIME});pg.drawText(title,{x:MX+8,y:y,size:22,font:F,color:INK});y-=58;
  heading('DAS PARTES');
  box(`**CONSIGNANTE: ${S.name}**${S.qual?', '+S.qual:''}, inscrito no CPF nº ${S.doc}, titular da marca **DOPAMINA 3D**, com endereço comercial sito à ${S.addr}${S.email?', E-mail '+S.email:''}.${S.wa?' WhatsApp: '+S.wa+'.':''}${S.ig?' Instagram: '+S.ig+'.':''} Doravante denominado simplesmente **CONSIGNANTE**.`,LIME);
  box(pj?`**${CA}: ${d.name}**, nome fantasia **${tradeName}**, inscrita no CNPJ nº ${d.doc}, com sede em ${d.addr}, neste ato representada por ${d.rep}, CPF nº ${d.repdoc}, na qualidade de ${d.role}, e-mail ${d.email}, WhatsApp ${d.wa}, doravante denominada simplesmente **${CA}**.`
     :`**${CA}: ${d.name}**, inscrit${fem?'a':'o'} no CPF nº ${d.doc}, residente e domiciliad${fem?'a':'o'} em ${d.addr}, e-mail ${d.email}, WhatsApp ${d.wa}, doravante denominad${fem?'a':'o'} simplesmente **${CA}**.`,PINK);
  para(G(T.pre),{gap:10});
  for(const [h,ps] of T.clauses){heading(G(h));for(const p of ps)para(G(p).replace(BOLD_RE,m=>'**'+m+'**'),{gap:5});y-=6;}
  need(130);para(G(T.close).replace(/Goiânia – GO, .*$/,'').trim(),{gap:6});para(`Goiânia – GO, ${xdlong(d.cdate)}.`,{gap:4,justify:false});sigs(['CONSIGNANTE','Dopamina 3D'],[CA,tradeName]);
  /* Anexo I */
  newPage();heading(`ANEXO I — PEÇAS CONSIGNADAS, QUANTIDADES E VALORES (REMESSA Nº ${d.shipno})`);
  const cols=[{h:'MODELO',w:200},{h:'QTD.',w:40,r:1},{h:'REPASSE (UN.)',w:85,r:1},{h:'VAREJO SUG. (UN.)',w:95,r:1},{h:'TOTAL DE REPASSE',w:95,r:1}];let all=0,qall=0,letter=0;const LET='ABCDEFG';
  ['chaveiros','sensoriais','outros'].forEach(g=>{const L=d.items.filter(i=>i.g===g);if(!L.length)return;para(`${LET[letter++]}) ${GROUPS[g]}`,{bold:1,gap:4});const q=L.reduce((a,i)=>a+i.q,0),s=L.reduce((a,i)=>a+i.q*i.r,0);all+=s;qall+=q;table(cols,[...L.map(i=>[i.n,String(i.q),xrs(i.r),xrs(i.v),xrs(i.q*i.r)]),{cells:[GROUP_TOTAL[g],String(q),'','',xrs(s)],style:'total'}]);});
  if(d.items.some(i=>/Estrela/i.test(i.n)))para('Estrela Sensorial: repasse de R$ 30,00 em PLA Silk; em PLA de cor sólida, R$ 25,00 (varejo sugerido R$ 34,99).',{size:7.5,color:GREY,justify:false});
  const am=d.items.filter(i=>i.g==='amostras');if(am.length){para(`${LET[letter++]}) Amostras (separadas do estoque para venda)`,{bold:1,gap:4});table([{h:'MODELO',w:300},{h:'QTD.',w:50,r:1},{h:'VALOR',w:160}],am.map(i=>[i.n,String(i.q),'Conforme tabela (cláusula 2)']));}
  totalBox(`Valor total de repasse da Remessa nº ${d.shipno}`,`${qall} peça${qall===1?'':'s'} consignada${qall===1?'':'s'}, sem considerar as amostras`,xrs(all));
  /* Anexo II */
  newPage();heading(`ANEXO II — TERMO DE REMESSA E ACERTO (REMESSA Nº ${d.shipno})`);
  para(`Data da remessa: ${xdshort(d.cdate)}    Prazo de consignação até: ______________`,{gap:4,justify:false});if(S.pix)para('Chave PIX do consignante para pagamento: **'+S.pix+'**',{gap:6,justify:false});
  const c2=[{h:'MODELO',w:185},{h:'ENVIADO',w:50,r:1},{h:'REPASSE',w:62,r:1},{h:'VENDIDO',w:55},{h:'DEVOLVIDO',w:62},{h:'SALDO',w:45},{h:'REPASSAR (R$)',w:78}],rows2=[];
  [['chaveiros','CHAVEIROS'],['sensoriais','SOLAPAS E MODELOS SENSORIAIS'],['outros','OUTROS'],['amostras','AMOSTRAS']].forEach(([g,t])=>{const L=d.items.filter(i=>i.g===g);if(!L.length)return;rows2.push({cells:[t,'','','','','',''],style:'zebra'});L.forEach(i=>rows2.push([i.n,String(i.q),xrs(i.r),'','','','']));});
  rows2.push({cells:['Totais (sem amostras)',String(qall),'','','','',''],style:'total'});table(c2,rows2);
  para('Saldo = Enviado – Vendido – Devolvido. A repassar = peças vendidas × repasse (un.).',{size:7.5,color:GREY,justify:false});
  para(G('As partes declaram que conferiram as peças e os valores acima, que recebem/devolvem as peças descritas em perfeito estado, ressalvadas as observações a seguir, e que o saldo apurado em favor do CONSIGNANTE será pago no prazo da cláusula 5.2.'),{gap:8});
  para('Data do acerto: ______________',{gap:8,justify:false});para('Observações:',{bold:1,gap:16});para('Goiânia-GO, ______ de ____________ de 2______',{gap:2,justify:false});sigs(['DOPAMINA 3D (CONSIGNANTE)',''],[xclean(tradeName.toUpperCase())+` (${CA})`,'']);
  pages.forEach((p,i)=>{p.drawLine({start:{x:MX,y:44},end:{x:W-MX,y:44},thickness:.6,color:rgb(.82,.8,.74)});p.drawRectangle({x:MX,y:28.5,width:5,height:5,color:PINK});p.drawText('DOPAMINA 3D • UMA DOSE POR CAMADA, UM VÍCIO POR PEÇA.',{x:MX+10,y:28,size:6.3,font:F,color:GREY});const t=`Página ${i+1} de ${pages.length}`;p.drawText(t,{x:W-MX-F.widthOfTextAtSize(t,6.3),y:28,size:6.3,font:F,color:GREY});});
  doc.setTitle('Contrato de Consignação Mercantil — '+xclean(d.name));return await doc.save();
}

init().catch(e=>showLogin('Erro de inicialização: '+e.message));
})();