(() => {
const $ = s => document.querySelector(s);
const money = n => Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const date = d => d ? new Date(d+'T12:00:00').toLocaleDateString('pt-BR') : '—';
let toastTimer=null;
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
let sb=null, profile=null, currentTab='dashboard', sessionTask=null, passwordRecoveryMode=false, passwordJustUsed=null;
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
 requestAnimationFrame(()=>requestAnimationFrame(()=>window.scrollTo({top:y,left:0,behavior:'instant'})));
}
let scrollSaveFrame=false;
window.addEventListener('scroll',()=>{
 if(scrollSaveFrame)return;
 scrollSaveFrame=true;
 requestAnimationFrame(()=>{rememberTabScroll(currentTab);scrollSaveFrame=false;});
},{passive:true});
let tabLoadSequence=0;
const navItems = {
 admin:[['dashboard','Visão geral'],['production','Central de produção'],['catalog','Produtos e estoque'],['orders','Pedidos'],['shipments','Expedição'],['reports','Relatórios'],['contracts','Contratos'],['finance','Financeiro'],['users','Clientes e equipe']],
 collaborator:[['dashboard','Visão geral'],['production','Central de produção'],['catalog','Produtos e estoque'],['orders','Pedidos'],['shipments','Expedição'],['contracts','Contratos']],
 reseller:[['dashboard','Início'],['contract','Meu contrato'],['neworder','Pedir peças'],['myshipments','Minhas remessas'],['myorders','Meus pedidos']],
 customer:[['dashboard','Minha conta']]
};
const labels={admin:'Administrador',collaborator:'Colaborador',reseller:'Revendedor',customer:'Cliente'};
function showLogin(msg=''){ $('#loginView').classList.remove('hidden');$('#appView').classList.add('hidden');$('#loginForm').classList.remove('hidden');$('#resetPasswordBox')?.classList.add('hidden');$('#loginMsg').textContent=msg; }
function showApp(){ $('#loginView').classList.add('hidden');$('#appView').classList.remove('hidden');$('#userInfo').innerHTML=`<b>${escapeHtml(profile.full_name||profile.email||'Usuário')}</b><br>${escapeHtml(profile.email||'')}<br><span class="pill">${labels[profile.role]||profile.role}</span>`;$('#rolePill').textContent=labels[profile.role]||profile.role;renderNav();let saved='dashboard';try{saved=sessionStorage.getItem('dopamina3d:lastTab:'+profile.id)||'dashboard';}catch(e){}loadTab(saved,true);}
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
 const titles={dashboard:'Visão geral',production:'Central de produção',catalog:'Produtos e estoque',orders:'Pedidos',shipments:'Expedição',reports:'Relatórios',contracts:'Contratos',finance:'Financeiro',users:'Clientes e equipe',contract:'Meu contrato',neworder:'Solicitar peças',myshipments:'Minhas remessas',myorders:'Meus pedidos'};setTitle(titles[tab]||'Painel');
 if(!force && tabContentCache.has(tab)){
  content.replaceChildren(tabContentCache.get(tab));tabContentCache.delete(tab);restoreTabScroll(tab);return;
 }
 if(force)tabContentCache.delete(tab);
 const sequence=++tabLoadSequence;
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
 }catch(e){if(sequence===tabLoadSequence)content.innerHTML=`<div class="card alert">Não foi possível carregar esta área: ${escapeHtml(e.message||e)}. Verifique as políticas RLS e se o banco foi configurado.`;}
 if(sequence===tabLoadSequence)restoreTabScroll(tab);
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
 const rev=(txRes.data||[]).filter(x=>x.type==='income').reduce((a,x)=>a+Number(x.amount||0),0),exp=(txRes.data||[]).filter(x=>x.type==='expense').reduce((a,x)=>a+Number(x.amount||0),0);
 const pending=os.filter(x=>x.status==='pending').length,producing=os.filter(x=>x.status==='producing').length,low=lowRes.data||[];
 const cards=reseller?[metric('Pedidos realizados',os.length,'Seus pedidos recentes'),metric('Em andamento',os.filter(x=>!['completed','cancelled'].includes(x.status)).length,'Pedidos não finalizados'),metric('Peças disponíveis',ps.length,'Itens ativos no catálogo')]:[
  metric('Pedidos recebidos',os.length,'Últimos pedidos registrados'),metric('Aguardando análise',pending,'Precisam de aprovação'),metric('Em produção',producing,'Pedidos na fabricação'),metric('Produtos ativos',ps.length,'No catálogo') ,...(admin?[metric('Receita do mês',money(rev),'Lançamentos financeiros'),metric('Despesas do mês',money(exp),'Lançamentos financeiros'),metric('Resultado',money(rev-exp),'Receita menos despesas'),metric('Itens com estoque crítico',low.length,'Cinco unidades ou menos')]:[])
 ];
 const recent=os.slice(0,6).map(o=>`<tr><td><b>#${o.id.slice(0,8)}</b></td>${reseller?'':`<td>${escapeHtml(o.profiles?.full_name||o.profiles?.email||'—')}</td>`}<td>${date(o.created_at?.slice(0,10))}</td><td>${money(o.total)}</td><td>${statusPill(o.status)}</td></tr>`).join('');
 const stockAlerts=admin?`<section class="card panel-section"><div class="section-head"><div><span class="eyebrow">Atenção ao estoque</span><h2>Reposição recomendada</h2></div><button class="btn secondary" data-go="catalog">Abrir estoque</button></div>${low.length?`<div class="alert-list">${low.slice(0,5).map(x=>`<div class="alert-item"><span class="alert-symbol">!</span><div><b>${escapeHtml(x.name)}</b><small>${Number(x.stock_quantity||0)===0?'Sem unidades disponíveis':`${x.stock_quantity} unidade(s) restantes`}</small></div><span class="status bad">Crítico</span></div>`).join('')}</div>`:'<div class="empty-state">Estoque saudável. Nenhum produto abaixo do limite de segurança.</div>'}</section>`:'';
 const actions=reseller?[['neworder','＋','Solicitar reposição'],['myorders','▤','Acompanhar pedidos'],['myshipments','↗','Ver remessas'],['contract','⌑','Meu contrato']]:[['production','◈','Abrir produção'],['catalog','▦','Gerenciar produtos'],['orders','▤','Ver pedidos'],...(admin?[['reports','▥','Relatórios'],['finance','＄','Financeiro']]:[]),['shipments','↗','Expedição']];
 $('#content').innerHTML=`<section class="welcome-banner"><div><span class="eyebrow">${admin?'CENTRO DE COMANDO · DOPAMINA 3D':reseller?'ÁREA DO REVENDEDOR':'OPERAÇÃO DOPAMINA 3D'}</span><h2>${admin?'Sua operação, sob controle.':`Olá, ${escapeHtml(profile.full_name?.split(' ')[0]||'tudo bem')}!`}</h2><p>${admin?'Acompanhe pedidos, produção, estoque e desempenho em um só lugar.':'Acompanhe seus pedidos e mantenha sua operação sempre abastecida.'}</p></div><div class="welcome-orbit"><span>3D</span><i></i><b></b></div></section>
 <div class="grid dashboard-metrics">${cards.join('')}</div>
 <section class="card panel-section"><div class="section-head"><div><span class="eyebrow">Acesso rápido</span><h2>O que você precisa fazer?</h2></div></div><div class="quick-grid">${actions.map(([id,ico,label])=>`<button class="quick-action" data-go="${id}"><span>${ico}</span><b>${label}</b><small>Acessar módulo <i>↗</i></small></button>`).join('')}</div></section>
 <div class="dashboard-columns"><section class="card panel-section"><div class="section-head"><div><span class="eyebrow">Movimentação</span><h2>${reseller?'Seus pedidos recentes':'Pedidos recentes'}</h2></div><button class="btn secondary" data-go="${reseller?'myorders':'orders'}">Ver todos</button></div><div class="table-wrap"><table class="table"><thead><tr><th>Pedido</th>${reseller?'':'<th>Revendedor</th>'}<th>Data</th><th>Total</th><th>Situação</th></tr></thead><tbody>${recent||`<tr><td colspan="5" class="empty">Nenhum pedido registrado ainda.</td></tr>`}</tbody></table></div></section>${stockAlerts||`<section class="card panel-section"><span class="eyebrow">Próximo passo</span><h2>Faça sua próxima solicitação</h2><p class="muted">Consulte o catálogo e envie uma lista de peças para reposição.</p><button class="btn" data-go="neworder">Solicitar peças</button></section>`}</div>`;
 $('#content').querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>loadTab(b.dataset.go));
}
function statusPill(status){const labels={pending:'Aguardando análise',approved:'Aprovado',producing:'Em produção',shipped:'Enviado',completed:'Concluído',cancelled:'Cancelado'};return `<span class="status ${['approved','completed'].includes(status)?'ok':['cancelled'].includes(status)?'bad':'wait'}">${labels[status]||escapeHtml(status||'—')}</span>`;}
async function productionBoard(){
 const {data,error}=await sb.from('orders').select('*,profiles(full_name,email)').order('created_at',{ascending:true});if(error)throw error;
 const stages=[['pending','Aguardando análise'],['approved','Aprovados'],['producing','Em produção'],['shipped','Prontos / enviados'],['completed','Concluídos'],['cancelled','Cancelados']];
 $('#content').innerHTML=`<div class="production-intro"><div><span class="eyebrow">FLUXO DE TRABALHO</span><h2>Da solicitação à entrega.</h2><p>Acompanhe todos os pedidos, inclusive os concluídos e cancelados, em uma visão única da operação.</p></div><button class="btn secondary" id="refreshProduction">↻ Atualizar fila</button></div><div class="grid production-summary">${metric('Pedidos no total',data.length,'Todos os registros')}${metric('Em andamento',data.filter(o=>['pending','approved','producing','shipped'].includes(o.status)).length,'Fila operacional')}${metric('Concluídos',data.filter(o=>o.status==='completed').length,'Pedidos finalizados')}${metric('Cancelados',data.filter(o=>o.status==='cancelled').length,'Histórico de cancelamentos')}</div><div class="production-board">${stages.map(([key,label])=>{const items=data.filter(o=>o.status===key);return `<section class="production-lane ${key==='cancelled'?'lane-cancelled':''}"><header><b>${label}</b><span>${items.length}</span></header><div class="lane-cards">${items.map(o=>`<article class="production-card"><div class="row between"><b>#${o.id.slice(0,8)}</b><small>${date(o.created_at?.slice(0,10))}</small></div><p>${escapeHtml(o.profiles?.full_name||o.profiles?.email||'Cliente')}</p><strong>${money(o.total)}</strong><div class="row between"><span class="muted">${escapeHtml(o.order_type==='consignment'?'Consignação':o.order_type==='purchase'?'Compra':'Pedido')}</span>${key==='cancelled'?'<span class="status bad">Cancelado</span>':key==='completed'?'<span class="status ok">Finalizado</span>':`<button class="btn secondary" data-production-order="${o.id}" data-stage="${key}">Avançar</button>`}</div></article>`).join('')||'<div class="lane-empty">Nenhum pedido nesta etapa</div>'}</div></section>`}).join('')}</div>`;
 $('#refreshProduction').onclick=()=>productionBoard();
 const next={pending:['approved','Aprovar'],approved:['producing','Iniciar produção'],producing:['shipped','Marcar como enviado'],shipped:['completed','Concluir'],completed:null};
 $('#content').querySelectorAll('[data-production-order]').forEach(b=>b.onclick=async()=>{const [status,label]=next[b.dataset.stage]||[];if(!status)return;if(!confirm(`${label} o pedido #${b.dataset.productionOrder.slice(0,8)}?`))return;b.disabled=true;try{const r=await sb.from('orders').update({status}).eq('id',b.dataset.productionOrder).select('id').maybeSingle();if(r.error)throw r.error;if(!r.data)throw new Error('Atualização não autorizada.');toast('Etapa atualizada.');await productionBoard();}catch(e){toast('Não foi possível avançar: '+e.message);b.disabled=false;}});
}
async function reports(){
 const [p,o,t,s]=await Promise.all([sb.from('products').select('name,sku,category,price,stock_quantity,active').order('name'),sb.from('orders').select('id,status,total,order_type,created_at,profiles(full_name,email)').order('created_at',{ascending:false}),sb.from('financial_transactions').select('type,amount,date,category,description').order('date',{ascending:false}),sb.from('shipments').select('id,status,shipment_date,description,profiles!shipments_reseller_id_fkey(full_name)')]);for(const r of [p,o,t,s])if(r.error)throw r.error;
 const revenue=t.data.filter(x=>x.type==='income').reduce((a,x)=>a+Number(x.amount||0),0),expenses=t.data.filter(x=>x.type==='expense').reduce((a,x)=>a+Number(x.amount||0),0),totalOrders=o.data.reduce((a,x)=>a+Number(x.total||0),0),low=p.data.filter(x=>x.active&&Number(x.stock_quantity||0)<=5);
 $('#content').innerHTML=`<div class="report-hero"><span class="eyebrow">INTELIGÊNCIA OPERACIONAL</span><h2>Indicadores para decidir melhor.</h2><p>Resumo consolidado dos dados cadastrados no sistema. Exporte as bases para análises complementares.</p></div><div class="grid">${metric('Valor total dos pedidos',money(totalOrders),'Soma dos pedidos registrados')}${metric('Receitas lançadas',money(revenue),'Todos os lançamentos de receita')}${metric('Despesas lançadas',money(expenses),'Todos os lançamentos de despesa')}${metric('Resultado financeiro',money(revenue-expenses),'Receitas menos despesas')}${metric('Pedidos registrados',o.data.length,'Todos os status')}${metric('Ticket médio',money(o.data.length?totalOrders/o.data.length:0),'Valor médio por pedido')}${metric('Produtos ativos',p.data.filter(x=>x.active).length,'Itens disponíveis')}${metric('Produtos críticos',low.length,'Estoque de até 5 unidades')}</div><div class="report-grid"><section class="card panel-section"><span class="eyebrow">EXPORTAÇÃO DE DADOS</span><h2>Baixe relatórios em CSV</h2><p class="muted">Arquivos compatíveis com Excel, Google Sheets e ferramentas de análise.</p><div class="export-list"><button class="export-button" data-export="orders">⇩ <span><b>Relatório de pedidos</b><small>Pedidos, clientes, valores e status</small></span></button><button class="export-button" data-export="products">⇩ <span><b>Relatório de produtos e estoque</b><small>Preço, categoria, SKU e saldo</small></span></button><button class="export-button" data-export="finance">⇩ <span><b>Relatório financeiro</b><small>Receitas, despesas e categorias</small></span></button><button class="export-button" data-export="shipments">⇩ <span><b>Relatório de expedição</b><small>Remessas, destinatários e status</small></span></button></div></section><section class="card panel-section"><span class="eyebrow">PONTOS DE ATENÇÃO</span><h2>Saúde do catálogo</h2>${low.length?low.slice(0,8).map(x=>`<div class="alert-item"><span class="alert-symbol">!</span><div><b>${escapeHtml(x.name)}</b><small>${x.stock_quantity} unidade(s) disponíveis</small></div></div>`).join(''):'<div class="empty-state">Nenhum alerta de estoque no momento.</div>'}</section></div>`;
 const datasets={orders:o.data.map(x=>({pedido:x.id,cliente:x.profiles?.full_name||x.profiles?.email||'',data:x.created_at,status:x.status,modalidade:x.order_type,total:x.total})),products:p.data,finance:t.data,shipments:s.data.map(x=>({remessa:x.id,revendedor:x.profiles?.full_name||'',data:x.shipment_date,status:x.status,descricao:x.description}))};
 $('#content').querySelectorAll('[data-export]').forEach(b=>b.onclick=()=>downloadCSV(`dopamina3d-${b.dataset.export}-${new Date().toISOString().slice(0,10)}.csv`,datasets[b.dataset.export]));
}
function downloadCSV(filename,rows){if(!rows?.length){toast('Não há dados para exportar.');return;}const headers=[...new Set(rows.flatMap(x=>Object.keys(x)))],cell=v=>`"${String(v??'').replace(/"/g,'""')}"`,csv='\ufeff'+[headers.map(cell).join(';'),...rows.map(r=>headers.map(h=>cell(r[h])).join(';'))].join('\r\n'),blob=new Blob([csv],{type:'text/csv;charset=utf-8;'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);toast('Relatório exportado.');}
async function customerDashboard(){
 const {data:d,error}=await sb.from('customer_profiles').select('*').eq('user_id',profile.id).maybeSingle();if(error)throw error;
 if(!d){$('#content').innerHTML='<div class="card alert">Não encontramos seus dados cadastrais. Entre em contato com a Dopamina 3D.</div>';return;}
 const fields=[['Telefone / WhatsApp',d.phone],['CPF',d.document_number],['CEP',d.postal_code],['Endereço',[d.street,d.address_number,d.complement].filter(Boolean).join(', ')],['Bairro',d.neighborhood],['Cidade / UF',[d.city,d.state].filter(Boolean).join(' / ')],['Referência',d.reference]];
 $('#content').innerHTML=`<div class="card"><h2>Bem-vindo(a), ${escapeHtml(profile.full_name||'cliente')}!</h2><p class="muted">Seu cadastro de cliente está ativo. Para solicitar uma peça ou tirar dúvidas, utilize nossos canais de atendimento.</p><div class="section"><h2>Seus dados cadastrais</h2><div class="grid">${fields.filter(x=>x[1]).map(x=>`<div><small class="muted">${x[0]}</small><p>${escapeHtml(x[1])}</p></div>`).join('')}</div></div><div class="actions"><a class="btn secondary" href="index.html">Ver catálogo</a></div></div>`;
}
function metric(label,value,sub){return `<div class="card metric"><small>${label}</small><strong>${value}</strong><em>${sub}</em></div>`}
async function catalog(){
 const {data,error}=await sb.from('products').select('*').order('name');if(error)throw error;
 const internal=profile.role==='admin'&&data.length?await sb.from('product_internal_data').select('product_id,cost_price').in('product_id',data.map(x=>x.id)):({data:[]});if(internal.error)throw internal.error;
 const costs=new Map((internal.data||[]).map(x=>[x.product_id,Number(x.cost_price||0)]));
 const rows=(data||[]).map(p=>{const cost=costs.get(p.id)||0,margin=Number(p.price||0)-cost;return `<tr data-product-row="${p.id}"><td><b>${escapeHtml(p.name)}</b><br><small class="muted">${escapeHtml(p.sku||'')}</small></td><td>${money(p.price)}</td>${profile.role==='admin'?`<td>${money(cost)}</td><td><b>${money(margin)}</b></td>`:''}<td><div class="stock-edit"><input aria-label="Estoque de ${escapeHtml(p.name)}" type="number" min="0" step="1" value="${Math.max(0,Number(p.stock_quantity)||0)}" data-stock-input="${p.id}"><button type="button" class="icon-save-btn stock-save" data-stock-save="${p.id}" aria-label="Salvar estoque" title="Salvar estoque"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h12l4 4v14H3V3h2Z"/><path d="M7 3v6h10V3M7 21v-7h10v7M9 17h6"/></svg></button></div><small class="muted">${Number(p.stock_quantity||0)<=5?'Estoque baixo':'Em estoque'}</small></td><td>${escapeHtml((p.colors||[]).join(', ')||'—')}</td><td><span class="status ${p.active?'ok':'bad'}">${p.active?'Ativa':'Inativa'}</span></td><td><div class="product-row-actions"><button class="btn secondary" data-edit="${p.id}">Editar</button><button type="button" class="product-status-toggle ${p.active?'is-active':'is-inactive'}" data-toggle-product-active="${p.id}" data-next-active="${p.active?'false':'true'}" aria-label="${p.active?'Desativar':'Ativar'} ${escapeHtml(p.name)}">${p.active?'Desativar':'Ativar'}</button></div></td></tr>`}).join('');
 const low=(data||[]).filter(p=>Number(p.stock_quantity||0)<=5).length;
 $('#content').innerHTML=`<div class="grid">${metric('Produtos cadastrados',data.length,'Ativos e inativos')}${metric('Produtos ativos',data.filter(p=>p.active).length,'Disponíveis no catálogo')}${metric('Estoque baixo',low,'Até 5 unidades')}${metric('Unidades em estoque',(data||[]).reduce((a,p)=>a+Math.max(0,Number(p.stock_quantity)||0),0),'Soma das quantidades cadastradas')}</div><div class="card section"><div class="row between"><div><h2>Produtos e controle de estoque</h2><span class="muted">Atualize quantidades diretamente na tabela ou edite os dados completos do produto.</span></div><button class="btn" id="addProduct">+ Novo produto</button></div><div class="row" style="margin:14px 0"><input id="productSearch" placeholder="Buscar por nome ou SKU..." style="max-width:320px"><select id="stockFilter" style="max-width:200px"><option value="all">Todos os produtos</option><option value="low">Estoque baixo (até 5)</option><option value="zero">Sem estoque</option><option value="active">Somente ativos</option><option value="inactive">Somente inativos</option></select></div><div class="table-wrap"><table class="table"><thead><tr><th>Produto</th><th>Venda</th>${profile.role==='admin'?'<th>Custo</th><th>Margem</th>':''}<th>Estoque (un.)</th><th>Cores</th><th>Disponibilidade</th><th>Ações</th></tr></thead><tbody>${rows||`<tr><td colspan="${profile.role==='admin'?8:6}" class="empty">Nenhum produto cadastrado.</td></tr>`}</tbody></table></div></div><div id="productForm" class="card section hidden"></div>`;
 $('#addProduct').onclick=()=>{ $('#content').querySelectorAll('.inline-product-editor').forEach(el=>el.remove()); editProduct(); };
 $('#content').querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{
  const product=data.find(x=>x.id===b.dataset.edit),row=b.closest('tr');
  $('#content').querySelectorAll('.inline-product-editor').forEach(el=>el.remove());
  const inline=document.createElement('tr');inline.className='inline-product-editor';inline.innerHTML=`<td colspan="${profile.role==='admin'?8:6}"><div id="productForm" class="card inline-product-card"></div></td>`;
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
 if(form.elements.active)data.active=form.elements.active.checked;
 data.savedAt=new Date().toISOString();
 try{localStorage.setItem(productDraftKey(productId),JSON.stringify(data));return true;}
 catch(_){return false;}
}
function applyProductDraft(form,draft){
 if(!draft)return;
 Object.entries(draft).forEach(([key,value])=>{
  const field=form.elements.namedItem(key);
  if(!field||key==='savedAt')return;
  if(key==='active'&&field.type==='checkbox')field.checked=Boolean(value);
  else field.value=value??'';
 });
}
function clearProductDraft(productId){
 try{localStorage.removeItem(productDraftKey(productId));}catch(_){}
}
function editProduct(p={},inline=false){
 const f=$('#productForm'),draftKey=productDraftKey(p.id||null),draft=readProductDraft(p.id||null);
 f.classList.remove('hidden');
 f.innerHTML=`<h2>${p.id?'Editar produto':'Cadastrar produto'}</h2><form id="pf" class="form-grid"><div class="field"><label>Nome</label><input name="name" required value="${escapeHtml(p.name||'')}"></div><div class="field"><label>SKU / Código interno</label><input name="sku" value="${escapeHtml(p.sku||'')}"></div><div class="field"><label>Categoria</label><input name="category" value="${escapeHtml(p.category||'Geral')}"></div><div class="field full image-upload-field"><label>Imagem do produto</label><div class="image-upload-row"><div class="image-preview" id="productImagePreview">${p.image_url?`<img src="${escapeHtml(p.image_url)}" alt="Prévia do produto">`:'<span>Prévia da imagem</span>'}</div><div class="image-upload-controls"><input name="image_file" type="file" accept="image/png,image/jpeg,image/webp,image/gif"><small class="muted">PNG, JPG, WebP ou GIF · até 8 MB. O envio será feito ao Storage do Supabase.</small><label for="image_url">Ou informe uma URL existente</label><input id="image_url" name="image_url" type="url" value="${escapeHtml(p.image_url||'')}" placeholder="https://..."></div></div></div><div class="field"><label>Preço de venda (R$)</label><input name="price" type="number" min="0" step=".01" required value="${p.price??''}"></div>${profile.role==='admin'?`<div class="field"><label>Custo unitário (R$)</label><input name="cost_price" type="number" min="0" step=".01" value="${p.cost_price??0}"></div>`:''}<div class="field"><label>Estoque atual (unidades)</label><input name="stock_quantity" type="number" min="0" step="1" value="${p.stock_quantity??0}" required></div><div class="field"><label>Cores disponíveis (separe por vírgula)</label><input name="colors" value="${escapeHtml((p.colors||[]).join(', '))}"></div><div class="field full"><label>Descrição</label><textarea name="description">${escapeHtml(p.description||'')}</textarea></div><div class="field full"><small class="muted">Situação no catálogo: <strong>${p.active===false?'Inativo':'Ativo'}</strong>. Para ativar ou desativar, use o botão correspondente na linha do produto.</small></div><div class="field full"><small id="productDraftStatus" class="muted">As alterações são salvas automaticamente neste navegador.</small></div><div class="field full actions">${saveIconButton("Salvar produto")}<button class="btn secondary" type="button" id="cancelPF">Cancelar</button></div></form>`;
 const form=$('#pf'),status=$('#productDraftStatus');
 const imageInput=form.elements.image_file,imagePreview=$('#productImagePreview');
 imageInput?.addEventListener('change',()=>{
  const file=imageInput.files?.[0];if(!file)return;
  if(!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type)||file.size>8*1024*1024){toast('Escolha PNG, JPG, WebP ou GIF de até 8 MB.');imageInput.value='';return;}
  const localUrl=URL.createObjectURL(file);imagePreview.innerHTML=`<img src="${localUrl}" alt="Prévia da imagem selecionada">`;
 });
 if(draft){applyProductDraft(form,draft);status.textContent='Rascunho recuperado automaticamente. Continue de onde parou.';}
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
  const payload={name:d.get('name').trim(),sku:d.get('sku').trim()||null,category:d.get('category')||'Geral',image_url:imageUrl,price:Number(d.get('price')),stock_quantity:qty,colors:d.get('colors').split(',').map(x=>x.trim()).filter(Boolean),description:d.get('description'),active:p.active!==false};
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
 const rows=data.map(x=>`<tr data-finance-row="${x.id}"><td>${date(x.date)}</td><td><span class="status ${x.type==='income'?'ok':'bad'}">${x.type==='income'?'Receita':'Despesa'}</span></td><td>${escapeHtml(x.category||'—')}</td><td>${escapeHtml(x.description)}</td><td>${money(x.amount)}</td><td>${x.attachment_path?`<div class="finance-file-actions"><button type="button" class="btn secondary finance-open-btn" data-file="${escapeHtml(x.attachment_path)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3h7v7M10 14 21 3M19 13v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h7"/></svg>Abrir</button>${deleteIconButton(`data-remove-file="${x.id}"`,'Excluir anexo')}</div>`:'—'}</td><td><div class="finance-row-actions"><button class="btn secondary" data-tx="${x.id}">Editar</button>${deleteIconButton(`data-delete-tx="${x.id}"`,'Excluir lançamento')}</div></td></tr>`).join('');
 $('#content').innerHTML=`<div class="grid">${metric('Receitas registradas',money(inc),'Total do período carregado')}${metric('Despesas registradas',money(out),'Total do período carregado')}${metric('Saldo',money(inc-out),'Receitas menos despesas')}${metric('Lançamentos',data.length,'Receitas e despesas')}</div>${chart}<div class="section card"><div class="row between"><div><h2>Lançamentos financeiros</h2><span class="muted">Registre entradas, saídas, datas, observações e comprovantes.</span></div><div class="actions"><button class="btn secondary" id="exportFinance">Exportar CSV</button><button class="btn" id="addTx">+ Novo lançamento</button></div></div><div class="row" style="margin:14px 0"><label class="field">De <input id="financeFrom" type="date" value="${window.financeFrom||''}"></label><label class="field">Até <input id="financeTo" type="date" value="${window.financeTo||''}"></label><button class="btn secondary" id="clearFinanceFilter">Limpar período</button></div><div class="table-wrap"><table class="table"><thead><tr><th>Data</th><th>Tipo</th><th>Categoria</th><th>Descrição</th><th>Valor</th><th>Comprovante</th><th>Ações</th></tr></thead><tbody>${rows||'<tr><td colspan="7" class="empty">Nenhum lançamento encontrado.</td></tr>'}</tbody></table></div></div><div id="txForm" class="card section hidden"></div>`;
 $('#addTx').onclick=()=>editTx();
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
 const rows=data.map(o=>`<tr><td>#${o.id.slice(0,8)}</td><td>${own?'':escapeHtml(o.profiles?.full_name||o.profiles?.email||'')}</td><td>${date(o.created_at?.slice(0,10))}</td><td>${escapeHtml(o.order_type==='consignment'?'Consignação':o.order_type==='purchase'?'Compra de peças':o.order_type||'Venda')}</td><td>${money(o.total)}</td><td><span class="status ${o.status==='approved'||o.status==='completed'?'ok':o.status==='cancelled'?'bad':'wait'}">${statusLabels[o.status]||escapeHtml(o.status)}</span></td><td><div class="order-actions"><button type="button" class="btn secondary" data-order-details="${o.id}">Detalhes</button>${own?'':`<details class="status-menu"><summary class="btn">Alterar status ▾</summary><div class="status-options">${Object.entries(statusLabels).filter(([v])=>v!==o.status).map(([v,l])=>`<button type="button" data-order-status="${o.id}" data-status="${v}">${l}</button>`).join('')}</div></details>`}</div></td></tr><tr class="order-detail-row hidden" data-detail-row="${o.id}"><td colspan="7"><div class="order-detail" id="order-detail-${o.id}">Carregando itens...</div></td></tr>`).join('');
 $('#content').innerHTML=`<div class="grid">${metric('Pedidos',data.length,'Total de solicitações')}${metric('Aguardando análise',data.filter(o=>o.status==='pending').length,'Precisam de atenção')}${metric('Em produção',data.filter(o=>o.status==='producing').length,'Em fabricação')}${metric('Concluídos',data.filter(o=>o.status==='completed').length,'Pedidos finalizados')}</div><div class="card section"><div class="row between"><div><h2>${own?'Seus pedidos':'Gestão de pedidos'}</h2><span class="muted">Consulte os itens e atualize o andamento sem janelas de prompt.</span></div><input id="orderSearch" placeholder="Buscar pedido ou revendedor..." style="max-width:280px"></div><div class="table-wrap"><table class="table"><thead><tr><th>Pedido</th>${own?'':'<th>Revendedor</th>'}<th>Data</th><th>Modalidade</th><th>Total</th><th>Status</th><th>Ações</th></tr></thead><tbody>${rows||`<tr><td colspan="7" class="empty">Nenhum pedido registrado.</td></tr>`}</tbody></table></div></div>`;
 $('#orderSearch').oninput=e=>{const term=e.target.value.toLocaleLowerCase('pt-BR');$('#content').querySelectorAll('tbody tr:not(.order-detail-row)').forEach(tr=>tr.hidden=!tr.textContent.toLocaleLowerCase('pt-BR').includes(term));};
 $('#content').querySelectorAll('[data-order-status]').forEach(b=>b.onclick=async()=>{const id=b.dataset.orderStatus,status=b.dataset.status,label=statusLabels[status];if(!confirm(`Alterar o status do pedido #${id.slice(0,8)} para "${label}"?`))return;b.disabled=true;try{const r=await sb.from('orders').update({status}).eq('id',id).select('id,status').maybeSingle();if(r.error)throw r.error;if(!r.data)throw new Error('O pedido não foi atualizado. Verifique as permissões RLS.');toast('Status do pedido atualizado.');await orders(false);}catch(err){toast('Falha ao atualizar status: '+err.message);b.disabled=false;}});
 $('#content').querySelectorAll('[data-order-details]').forEach(b=>b.onclick=async()=>{const id=b.dataset.orderDetails,row=$(`[data-detail-row="${id}"]`);row.classList.toggle('hidden');if(!row.classList.contains('hidden')){const target=$(`#order-detail-${id}`);if(target.dataset.loaded)return;try{const r=await sb.from('order_items').select('quantity,unit_price,products(name,sku)').eq('order_id',id);if(r.error)throw r.error;target.innerHTML=r.data.length?`<b>Itens do pedido</b><div class="table-wrap"><table class="table"><thead><tr><th>Produto</th><th>Quantidade</th><th>Preço unitário</th><th>Subtotal</th></tr></thead><tbody>${r.data.map(i=>`<tr><td>${escapeHtml(i.products?.name||'Produto')}</td><td>${i.quantity}</td><td>${money(i.unit_price)}</td><td>${money(Number(i.quantity)*Number(i.unit_price))}</td></tr>`).join('')}</tbody></table></div>`:'Nenhum item detalhado encontrado.';target.dataset.loaded='1';}catch(err){target.textContent='Não foi possível carregar os itens: '+err.message;}}});
}
async function newOrder(){
 const {data,error}=await sb.from('products').select('id,name,price,colors').eq('active',true).order('name');if(error)throw error;
 $('#content').innerHTML=`<div class="card"><h2>Solicitar novas peças</h2><p class="muted">Informe a modalidade e descreva as peças e quantidades desejadas. A equipe confirmará valores e prazo.</p><form id="of" class="form-grid"><div class="field"><label>Modalidade</label><select name="order_type"><option value="purchase">Compra de peças</option><option value="consignment">Consignação</option></select></div><div class="field"><label>Previsão / observação</label><input name="notes" placeholder="Ex.: reposição para o próximo mês"></div><div class="field full"><label>Peças e quantidades</label><div id="orderLines"></div><button type="button" class="btn secondary" id="addLine">+ Adicionar peça</button></div><div class="field full"><label>Observações adicionais</label><textarea name="details"></textarea></div><div class="field full"><button class="btn">Enviar solicitação</button></div></form></div>`;
 const lines=$('#orderLines');function addLine(){const d=document.createElement('div');d.className='row';d.style.margin='8px 0';d.innerHTML=`<select class="prod" style="flex:1"><option value="">Selecione uma peça</option>${data.map(p=>`<option value="${p.id}">${escapeHtml(p.name)} · ${money(p.price)}</option>`).join('')}</select><input class="qty" type="number" min="1" value="1" style="width:90px">${deleteIconButton('','Remover item da solicitação')}`;d.querySelector('button').onclick=()=>d.remove();lines.append(d);}addLine();$('#addLine').onclick=addLine;
 let requestId=crypto.randomUUID();$('#of').onsubmit=async e=>{e.preventDefault();const form=e.currentTarget,submit=form.querySelector('button[type=submit],button:not([type])');const d=new FormData(form),items=[...lines.children].map(x=>({product_id:x.querySelector('.prod').value,quantity:Number(x.querySelector('.qty').value)})).filter(x=>x.product_id&&Number.isInteger(x.quantity)&&x.quantity>0);if(!items.length){toast('Adicione ao menos uma peça com quantidade válida.');return;}if(items.length>30||items.some(x=>x.quantity>1000)){toast('Limite: 30 linhas de produtos e até 1.000 unidades por linha.');return;}if(new Set(items.map(x=>x.product_id)).size!==items.length){toast('Remova produtos repetidos ou consolide suas quantidades.');return;}if(submit)submit.disabled=true;try{const {data:orderId,error:orderError}=await sb.rpc('create_reseller_order',{p_order_type:String(d.get('order_type')||''),p_notes:[d.get('notes'),d.get('details')].filter(Boolean).join(' | ').slice(0,2000),p_items:items,p_request_id:requestId});if(orderError)throw orderError;if(!orderId)throw new Error('O servidor não confirmou o número do pedido.');toast('Solicitação enviada à Dopamina 3D.');requestId=crypto.randomUUID();await loadTab('myorders');}catch(err){toast('Não foi possível enviar o pedido: '+(err.message||'Falha inesperada.'));if(submit)submit.disabled=false;}};
}
async function shipments(own){
 let q=sb.from('shipments').select('*,profiles!shipments_reseller_id_fkey(full_name)').order('created_at',{ascending:false});if(own)q=q.eq('reseller_id',profile.id);const {data,error}=await q;if(error)throw error;
 const shipLabels={preparing:'Em produção',sent:'Enviada',delivered:'Entregue'};
 const filter=window.shipmentFilter||'all';
 const filtered=data.filter(x=>filter==='all'||x.status===filter);
 const rows=filtered.map(s=>`<tr><td>#${s.id.slice(0,8)}</td><td>${own?'':escapeHtml(s.profiles?.full_name||'')}</td><td>${date(s.shipment_date)}</td><td>${escapeHtml(s.description||'')}</td><td><span class="status ${s.status==='delivered'?'ok':s.status==='sent'?'info':'wait'}">${shipLabels[s.status]||escapeHtml(s.status)}</span>${s.shipment_type==='consignment'?'<small class="muted">Consignação</small>':''}${s.settled_at?`<small class="status ok">Acerto: ${money(s.settlement_amount)}</small>`:''}</td><td>${own?'':`<div class="shipment-actions"><select data-ship-status="${s.id}" aria-label="Status da remessa"><option value="preparing" ${s.status==='preparing'?'selected':''}>Em produção</option><option value="sent" ${s.status==='sent'?'selected':''}>Enviada</option><option value="delivered" ${s.status==='delivered'?'selected':''}>Entregue</option></select><button type="button" class="icon-save-btn" data-ship="${s.id}" aria-label="Salvar status da remessa" title="Salvar status da remessa"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h12l4 4v14H3V3h2Z"/><path d="M7 3v6h10V3M7 21v-7h10v7M9 17h6"/></svg></button>${profile.role==='admin'&&s.status==='delivered'&&s.shipment_type==='consignment'&&!s.settled_at?`<button class="btn secondary shipment-settle-btn" data-settle="${s.id}">Fazer acerto</button>`:''}</div>`}</td></tr>`).join('');
 const counts={all:data.length,preparing:data.filter(x=>x.status==='preparing').length,sent:data.filter(x=>x.status==='sent').length,delivered:data.filter(x=>x.status==='delivered').length};
 $('#content').innerHTML=`<div class="card"><div class="row between"><div><h2>${own?'Suas remessas':'Expedição'}</h2><span class="muted">Acompanhe produção, envio, entrega e acertos de consignação.</span></div>${own?'':'<button class="btn" id="addShip">+ Nova remessa</button>'}</div><div class="status-tabs shipment-tabs"><button type="button" data-ship-filter="all" class="${filter==='all'?'active':''}">Todas <span>${counts.all}</span></button><button type="button" data-ship-filter="preparing" class="${filter==='preparing'?'active':''}">Em produção <span>${counts.preparing}</span></button><button type="button" data-ship-filter="sent" class="${filter==='sent'?'active':''}">Enviadas <span>${counts.sent}</span></button><button type="button" data-ship-filter="delivered" class="${filter==='delivered'?'active':''}">Entregues <span>${counts.delivered}</span></button></div><div class="table-wrap"><table class="table"><thead><tr><th>Remessa</th>${own?'':'<th>Revendedor</th>'}<th>Data</th><th>Descrição</th><th>Status</th><th>Ações</th></tr></thead><tbody>${rows||'<tr><td colspan="6" class="empty">Nenhuma remessa nesta etapa.</td></tr>'}</tbody></table></div></div><div id="shipForm" class="card section hidden"></div><div id="settlementForm" class="card section hidden"></div>`;
 $('#content').querySelectorAll('[data-ship-filter]').forEach(b=>b.onclick=()=>{window.shipmentFilter=b.dataset.shipFilter;shipments(own);});
 if(!own){
  $('#addShip').onclick=async()=>{
   const {data:res,error:resError}=await sb.from('profiles').select('id,full_name,email').eq('role','reseller');if(resError)throw resError;
   const f=$('#shipForm');f.classList.remove('hidden');f.innerHTML=`<div class="row between"><h2>Nova remessa</h2><button type="button" class="btn secondary" id="cancelShip">Cancelar</button></div><form id="sf" class="form-grid"><div class="field"><label>Revendedor</label><select name="reseller_id" required>${(res||[]).map(x=>`<option value="${x.id}">${escapeHtml(x.full_name||x.email)}</option>`).join('')}</select></div><div class="field"><label>Tipo de remessa</label><select name="shipment_type"><option value="purchase">Compra</option><option value="consignment">Consignação</option></select></div><div class="field"><label>Data</label><input name="shipment_date" type="date" value="${new Date().toISOString().slice(0,10)}" required></div><div class="field"><label>Status inicial</label><select name="status"><option value="preparing">Em produção</option><option value="sent">Enviada</option><option value="delivered">Entregue</option></select></div><div class="field full"><label>Descrição / peças</label><input name="description" required maxlength="1000"></div><div class="field full actions"><button class="btn" type="submit">Criar remessa</button></div></form>`;
   $('#cancelShip').onclick=()=>{f.classList.add('hidden');$('#sf').reset();};
   $('#sf').onsubmit=async e=>{e.preventDefault();const d=new FormData(e.target),payload=Object.fromEntries(d);const r=await sb.from('shipments').insert(payload);if(r.error){toast('Não foi possível criar a remessa: '+r.error.message);return;}toast('Remessa criada.');window.shipmentFilter='all';shipments(false);};
  };
  $('#content').querySelectorAll('[data-ship]').forEach(b=>b.onclick=async()=>{const status=$(`[data-ship-status="${b.dataset.ship}"]`).value;if(!confirm(`Salvar situação da remessa como “${shipLabels[status]}”?`))return;b.disabled=true;try{const r=await sb.from('shipments').update({status}).eq('id',b.dataset.ship).select('id').maybeSingle();if(r.error)throw r.error;if(!r.data)throw new Error('Atualização não autorizada.');toast('Situação da remessa atualizada.');await shipments(false);}catch(e){toast('Falha ao atualizar: '+e.message);b.disabled=false;}});
  $('#content').querySelectorAll('[data-settle]').forEach(b=>b.onclick=()=>{
   const shipment=data.find(x=>x.id===b.dataset.settle);if(!shipment)return;const box=$('#settlementForm');box.classList.remove('hidden');box.innerHTML=`<div class="row between"><h2>Acerto de consignação</h2><button type="button" class="btn secondary" id="cancelSettlement">Cancelar</button></div><p class="muted">Registre o valor efetivamente recebido do revendedor. O valor será lançado como receita no Financeiro.</p><form id="settlementFormFields" class="form-grid"><div class="field"><label>Revendedor</label><input value="${escapeHtml(shipment.profiles?.full_name||'Revendedor')}" disabled></div><div class="field"><label>Valor recebido (R$)</label><input name="amount" type="number" min="0.01" step="0.01" required></div><div class="field full"><label>Observação</label><input name="description" value="Acerto de consignação — remessa #${shipment.id.slice(0,8)}"></div><div class="field full actions"><button type="submit" class="btn">Confirmar acerto</button></div></form>`;
   $('#cancelSettlement').onclick=()=>box.classList.add('hidden');
   $('#settlementFormFields').onsubmit=async e=>{e.preventDefault();const d=new FormData(e.target),amount=Number(d.get('amount'));if(!Number.isFinite(amount)||amount<=0){toast('Informe um valor recebido válido.');return;}const btn=e.target.querySelector('button[type="submit"]');btn.disabled=true;try{const tx=await sb.from('financial_transactions').insert({type:'income',amount,date:new Date().toISOString().slice(0,10),competence_month:new Date().toISOString().slice(0,7),category:'Acerto de consignação',description:String(d.get('description')||'Acerto de consignação').slice(0,500)}).select('id').single();if(tx.error)throw tx.error;const upd=await sb.from('shipments').update({settled_at:new Date().toISOString(),settlement_amount:amount,settled_by:profile.id}).eq('id',shipment.id).is('settled_at',null).select('id').maybeSingle();if(upd.error||!upd.data){await sb.from('financial_transactions').delete().eq('id',tx.data.id);throw upd.error||new Error('Esta remessa já foi acertada.');}toast('Acerto registrado no Financeiro.');await shipments(false);}catch(err){toast('Não foi possível concluir o acerto: '+err.message);btn.disabled=false;}};
  });
 }
}

async function contracts(own){
 let q=sb.from('contracts').select('*,profiles(full_name)').order('created_at',{ascending:false});if(own)q=q.eq('reseller_id',profile.id);const {data,error}=await q;if(error)throw error;
 const filter=window.contractFilter||'all';const isClosed=c=>['terminated','closed','ended','cancelled'].includes(String(c.status||'').toLowerCase());
 const filtered=(data||[]).filter(c=>filter==='all'||(filter==='active'?!isClosed(c):isClosed(c)));
 const counts={all:data.length,active:data.filter(c=>!isClosed(c)).length,closed:data.filter(isClosed).length};
 $('#content').innerHTML=`<div class="card"><div class="row between"><div><h2>${own?'Contrato firmado':'Contratos'}</h2><span class="muted">${own?'Consulte o documento e a situação do seu contrato.':'Gerencie os documentos e o ciclo de vida dos contratos.'}</span></div>${profile.role==='admin'&&!own?'<button class="btn" id="addContract">+ Anexar contrato</button>':''}</div><div class="status-tabs contract-tabs"><button type="button" data-contract-filter="all" class="${filter==='all'?'active':''}">Todos <span>${counts.all}</span></button><button type="button" data-contract-filter="active" class="${filter==='active'?'active':''}">Ativos <span>${counts.active}</span></button><button type="button" data-contract-filter="closed" class="${filter==='closed'?'active':''}">Encerrados <span>${counts.closed}</span></button></div>${filtered.length?filtered.map(c=>`<div class="contract-row"><div class="contract-info"><b>${own?'Seu contrato':escapeHtml(c.profiles?.full_name||'Revendedor')}</b><br><small class="muted">${escapeHtml(c.title)} · ${date(c.signed_at)} · ${isClosed(c)?'Encerrado':'Ativo'}</small></div><div class="contract-actions"><button type="button" class="btn secondary contract-open-btn" data-contract="${escapeHtml(c.file_path)}">Abrir Contrato</button>${!own&&profile.role==='admin'&&!isClosed(c)?`<button type="button" class="icon-close-contract" data-close-contract="${c.id}" aria-label="Encerrar contrato" title="Encerrar contrato"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M8 12h8"/></svg></button>`:''}</div></div>`).join(''):'<div class="empty">Nenhum contrato nesta categoria.</div>'}</div>`;
 $('#content').querySelectorAll('[data-contract-filter]').forEach(b=>b.onclick=()=>{window.contractFilter=b.dataset.contractFilter;contracts(own);});
 $('#content').querySelectorAll('[data-contract]').forEach(a=>a.onclick=async()=>{await openPrivateStorageFile('contracts',a.dataset.contract);});
 $('#content').querySelectorAll('[data-close-contract]').forEach(b=>b.onclick=async()=>{const c=data.find(x=>x.id===b.dataset.closeContract);if(!c)return;if(!await confirmDelete(`Encerrar o contrato “${c.title}” de ${c.profiles?.full_name||'revendedor'}? O documento será mantido no histórico.`, 'Encerrar contrato?', 'Sim, encerrar'))return;b.disabled=true;try{const r=await sb.from('contracts').update({status:'terminated'}).eq('id',c.id).select('id').maybeSingle();if(r.error)throw r.error;if(!r.data)throw new Error('Não foi possível atualizar o contrato.');toast('Contrato encerrado.');await contracts(false);}catch(err){toast('Falha ao encerrar contrato: '+err.message);b.disabled=false;}});
 if(profile.role==='admin'&&!own)$('#addContract').onclick=async()=>{const {data:res,error:resError}=await sb.from('profiles').select('id,full_name,email').eq('role','reseller');if(resError)throw resError;const f=document.createElement('div');f.className='card section';f.innerHTML=`<div class="row between"><h2>Anexar contrato</h2><button type="button" class="btn secondary" id="cancelContract">Cancelar</button></div><form id="cf" class="form-grid"><div class="field"><label>Revendedor</label><select name="reseller_id">${(res||[]).map(x=>`<option value="${x.id}">${escapeHtml(x.full_name||x.email)}</option>`).join('')}</select></div><div class="field"><label>Título</label><input name="title" required value="Contrato de consignação"></div><div class="field"><label>Data de assinatura</label><input type="date" name="signed_at" value="${new Date().toISOString().slice(0,10)}"></div><div class="field"><label>Arquivo PDF</label><input type="file" name="file" accept="application/pdf" required></div><div class="field full">${saveIconButton("Salvar contrato")}</div></form>`;$('#content').append(f);$('#cancelContract').onclick=()=>f.remove();$('#cf').onsubmit=async e=>{e.preventDefault();const d=new FormData(e.target),file=d.get('file');if(!file||file.type!=='application/pdf'){toast('Envie um PDF.');return;}const key=`${d.get('reseller_id')}/${crypto.randomUUID()}.pdf`,up=await sb.storage.from('contracts').upload(key,file);if(up.error)throw up.error;const r=await sb.from('contracts').insert({reseller_id:d.get('reseller_id'),title:d.get('title'),signed_at:d.get('signed_at'),file_path:key,status:'signed'});if(r.error)throw r.error;toast('Contrato anexado.');contracts(false);};};
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
 const {data:{session}}=await sb.auth.getSession();if(session)await sessionCheck();else showLogin();
 sb.auth.onAuthStateChange((event)=>{
  if(event==='PASSWORD_RECOVERY'){showPasswordReset();return;}
  if(event==='SIGNED_IN'||event==='TOKEN_REFRESHED')setTimeout(()=>sessionCheck().catch(e=>showLogin(authMessage(e))),0);
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
 profile=data;$('#resetPasswordBox')?.classList.add('hidden');$('#loginForm').classList.remove('hidden');showApp();
}
init().catch(e=>showLogin('Erro de inicialização: '+e.message));
})();