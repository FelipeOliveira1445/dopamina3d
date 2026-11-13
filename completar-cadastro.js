(async()=>{
 const $=id=>document.getElementById(id), msg=(t,c='')=>{$('message').textContent=t;$('message').className='message '+c};
 if(!window.DOPAMINA_SUPABASE_URL||!window.DOPAMINA_SUPABASE_ANON_KEY||!window.supabase){$('loading').textContent='Não foi possível carregar a configuração do Supabase. Atualize portal-config.js.';return;}
 const sb=window.supabase.createClient(window.DOPAMINA_SUPABASE_URL,window.DOPAMINA_SUPABASE_ANON_KEY);
 try{
  const {data:{user},error}=await sb.auth.getUser();if(error||!user){location.replace('portal.html');return;}
  const {data:p,error:pe}=await sb.from('profiles').select('id,email,full_name,role,is_active').eq('id',user.id).maybeSingle();if(pe||!p||p.is_active===false)throw new Error('Não foi possível validar seu perfil. Entre novamente pelo portal.');
  if(!['reseller','collaborator'].includes(p.role)){location.replace('portal.html');return;}
  const {data:d,error:de}=await sb.from('customer_profiles').select('profile_completed').eq('user_id',user.id).maybeSingle();if(de)throw de;if(d?.profile_completed){location.replace('portal.html');return;}
  $('loading').classList.add('hidden');$('profileForm').classList.remove('hidden');$('full_name').value=p.full_name||user.user_metadata?.full_name||'';$('email').value=p.email||user.email||'';
  const isCollab=p.role==='collaborator';
  if(isCollab){$('documentTypeField').classList.add('hidden');$('document_type').value='CPF';$('documentLabel').textContent='CPF *';$('jobTitleField').classList.remove('hidden');$('job_title').required=true;$('businessSection').classList.add('hidden');$('addressSection').classList.add('hidden');$('collabNotice').classList.remove('hidden');['postal_code','address_number','street','neighborhood','city','state'].forEach(id=>$(id).required=false);}
  const docType=$('document_type');function syncDoc(){const cnpj=docType.value==='CNPJ';$('documentLabel').textContent=docType.value+' *';$('document_number').placeholder=cnpj?'00.000.000/0000-00':'000.000.000-00';$('legalNameField').classList.toggle('hidden',!cnpj);$('tradeNameField').classList.toggle('hidden',!cnpj);$('business_legal_name').required=cnpj;$('business_trade_name').required=cnpj;}
  docType.addEventListener('change',syncDoc);syncDoc();
  $('postal_code').addEventListener('blur',async()=>{const cep=$('postal_code').value.replace(/\D/g,'');if(cep.length!==8)return;try{const r=await fetch('https://viacep.com.br/ws/'+cep+'/json/');const x=await r.json();if(!x.erro){$('street').value=x.logradouro||$('street').value;$('neighborhood').value=x.bairro||$('neighborhood').value;$('city').value=x.localidade||$('city').value;$('state').value=x.uf||$('state').value;}}catch(_){}});
  $('profileForm').addEventListener('submit',async e=>{e.preventDefault();const b=$('saveButton');b.disabled=true;msg('Salvando seus dados...');const val=id=>$(id).value.trim();const payload={action:'complete_profile',privacy_accepted:$('privacyAccepted').checked,full_name:val('full_name'),phone:val('phone'),document_type:isCollab?'CPF':val('document_type'),document_number:val('document_number'),job_title:val('job_title'),business_legal_name:val('business_legal_name'),business_trade_name:val('business_trade_name'),business_location_name:val('business_location_name'),postal_code:val('postal_code'),street:val('street'),address_number:val('address_number'),complement:val('complement'),neighborhood:val('neighborhood'),city:val('city'),state:val('state'),reference:val('reference')};
   try{const {data,error}=await sb.functions.invoke('admin-users',{body:payload});if(error)throw error;if(data?.error)throw new Error(data.error);msg('Cadastro salvo. Redirecionando ao portal...','success');setTimeout(()=>location.replace('portal.html'),900);}catch(err){msg('Não foi possível salvar: '+(err.message||'Erro inesperado.'),'error');b.disabled=false;}
  });
 }catch(e){$('loading').textContent=e.message||'Não foi possível carregar o cadastro.';}
})();
