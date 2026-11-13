(() => {
  const cfg = window.DOPAMINA_SUPABASE_URL && window.DOPAMINA_SUPABASE_ANON_KEY;
  if (!cfg || window.DOPAMINA_SUPABASE_URL.includes('SEU-PROJETO') || window.DOPAMINA_SUPABASE_ANON_KEY.includes('SUA_CHAVE') || !window.supabase) return;
  const client = window.supabase.createClient(window.DOPAMINA_SUPABASE_URL, window.DOPAMINA_SUPABASE_ANON_KEY);
  const money = n => Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm = s => String(s??'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
  const category = p => String(p.category||'').trim() || 'Outros';
  const wa = name => 'https://wa.me/5562992628129?text='+encodeURIComponent(`Olá, tudo bem! Gostaria de fazer um pedido da peça *${name}*.`);
  function cardMarkup(p){
    const img=p.image_url?`<img alt="${esc(p.name)}" loading="lazy" decoding="async" width="640" height="640" sizes="(max-width: 640px) 92vw, (max-width: 1000px) 45vw, 30vw" src="${esc(p.image_url)}">`:`<div class="product-placeholder" role="img" aria-label="Imagem indisponível para ${esc(p.name)}">Dopamina 3D</div>`;
    const colors=(p.colors||[]).length?`<p class="price-note">Cores: ${esc(p.colors.join(', '))}</p>`:'';
    const details=p.catalog_details?`<p class="catalog-details">${esc(p.catalog_details)}</p>`:'';
    const featured=p.catalog_featured?'<span class="catalog-featured">Destaque</span>':'';
    return `<article class="card" data-product-id="${esc(p.id)}" data-category="${esc(category(p))}">${img}<div class="b">${featured}<h3>${esc(p.name)}</h3><p>${esc(p.description||'Peça produzida em impressão 3D.')}</p>${details}<div class="price-tag">${money(p.price)}</div>${colors}<a class="btn" data-m="Olá, tudo bem! Gostaria de fazer um pedido da peça *${esc(p.name)}*." href="https://ig.me/m/dopamina_3d">Pedir pelo Instagram</a><a class="btn btn-wa" href="${wa(p.name)}" target="_blank" rel="noopener">Pedir pelo WhatsApp</a></div></article>`;
  }
  function updateCard(card,p){
    card.hidden=false;card.dataset.productId=p.id;card.dataset.category=category(p);
    let im=card.querySelector('img');
    if(p.image_url){
      if(!im){
        im=document.createElement('img');
        im.loading='lazy';im.decoding='async';im.width=640;im.height=640;
        card.prepend(im);
      }
      im.src=p.image_url;
      im.alt=p.name;
    }
    // Sem image_url no banco: preserva a mídia legada já presente no HTML
    // (incluindo GIFs animados em /assets). Não substitui por placeholder.
    else if(im){
      im.alt=p.name;
    }
    const title=card.querySelector('h3');if(title)title.textContent=p.name;
    const body=card.querySelector('.b');
    const paragraphs=body?.querySelectorAll(':scope > p');
    if(paragraphs?.[0])paragraphs[0].textContent=p.description||'Peça produzida em impressão 3D.';
    let details=body?.querySelector('.catalog-details');
    if(p.catalog_details){if(!details){details=document.createElement('p');details.className='catalog-details';const desc=paragraphs?.[0];if(desc)desc.after(details);else body?.append(details)}details.textContent=p.catalog_details;}else details?.remove();
    let featured=body?.querySelector('.catalog-featured');
    if(p.catalog_featured){if(!featured){featured=document.createElement('span');featured.className='catalog-featured';body?.prepend(featured)}featured.textContent='Destaque';}else featured?.remove();
    let price=card.querySelector('.price-tag');if(!price){price=document.createElement('div');price.className='price-tag';body?.append(price)}price.textContent=money(p.price);
    let colors=card.querySelector('.price-note');if((p.colors||[]).length){if(!colors){colors=document.createElement('p');colors.className='price-note';price.after(colors)}colors.textContent='Cores: '+p.colors.join(', ')}else colors?.remove();
    const waLink=card.querySelector('a.btn-wa');if(waLink)waLink.href=wa(p.name);
    const insta=card.querySelector('a.btn[data-m]');if(insta)insta.dataset.m=`Olá, tudo bem! Gostaria de fazer um pedido da peça *${p.name}*.`;
  }
  let syncing=false;
  async function sync(){
    if(syncing)return;syncing=true;
    try{
      const {data,error}=await client.from('public_catalog_products').select('id,name,description,catalog_details,price,colors,image_url,category,catalog_order,catalog_featured').order('catalog_order',{ascending:true}).order('name',{ascending:true});
      if(error)throw error;
      const grid=document.querySelector('section.grid');if(!grid)return;
      const cards=[...grid.querySelectorAll('article.card')];
      const byId=new Map(cards.filter(c=>c.dataset.productId).map(c=>[String(c.dataset.productId),c]));
      const byName=new Map(cards.filter(c=>!c.dataset.productId).map(c=>[norm(c.querySelector('h3')?.textContent),c]));
      const activeIds=new Set(data.map(p=>String(p.id)));
      const ordered=[];
      for(const p of data){
        let card=byId.get(String(p.id))||byName.get(norm(p.name));
        if(card)updateCard(card,p);
        else {const wrap=document.createElement('div');wrap.innerHTML=cardMarkup(p).trim();card=wrap.firstElementChild;}
        if(card){card.hidden=false;ordered.push(card);}
      }
      // Banco é a fonte oficial: cards estáticos antigos ausentes da view não permanecem publicados.
      for(const c of cards)if(!activeIds.has(String(c.dataset.productId||'')))c.remove();
      ordered.forEach(card=>grid.append(card));
      window.DOPAMINA_REFRESH_FILTERS?.();
    }catch(err){console.warn('Catálogo permaneceu com a última versão carregada; sincronização indisponível:',err)}
    finally{syncing=false}
  }
  sync();
  client.channel('public-catalog-live').on('postgres_changes',{event:'*',schema:'public',table:'products'},sync).subscribe();
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync()});
  window.addEventListener('focus',sync);
})();
