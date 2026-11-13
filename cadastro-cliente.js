(async()=>{
 const $=id=>document.getElementById(id),msg=(t,c='')=>{$('message').textContent=t;$('message').className='message '+c};
 if(!window.DOPAMINA_SUPABASE_URL||!window.DOPAMINA_SUPABASE_ANON_KEY||!window.supabase){msg('Configuração do Supabase indisponível. Tente novamente mais tarde.','error');return;}
 const sb=window.supabase.createClient(window.DOPAMINA_SUPABASE_URL,window.DOPAMINA_SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true}});
 $('postal_code').addEventListener('blur',async()=>{const cep=$('postal_code').value.replace(/\D/g,'');if(cep.length!==8)return;try{const r=await fetch('https://viacep.com.br/ws/'+cep+'/json/');const x=await r.json();if(!x.erro){$('street').value=x.logradouro||$('street').value;$('neighborhood').value=x.bairro||$('neighborhood').value;$('city').value=x.localidade||$('city').value;$('state').value=x.uf||$('state').value;}}catch(_){}});
 $('customerForm').addEventListener('submit',async e=>{e.preventDefault();const b=$('submitButton');const v=id=>$(id).value.trim();if(v('password').length<10){msg('A senha precisa ter pelo menos 10 caracteres.','error');return;}if(v('password')!==v('confirmation')){msg('As senhas não coincidem.','error');return;}const phone=v('phone').replace(/\D/g,'');const cep=v('postal_code').replace(/\D/g,'');const cpf=v('document_number').replace(/\D/g,'');if(phone.length<10||phone.length>11){msg('Informe um telefone válido com DDD.','error');return;}if(cep.length!==8){msg('Informe um CEP válido.','error');return;}if(cpf&&cpf.length!==11){msg('O CPF deve conter 11 números.','error');return;}b.disabled=true;msg('Criando sua conta...');
  const metadata={full_name:v('full_name'),phone,document_number:cpf||null,postal_code:cep,street:v('street'),address_number:v('address_number'),complement:v('complement'),neighborhood:v('neighborhood'),city:v('city'),state:v('state').toUpperCase(),reference:v('reference'),privacy_accepted:'true'};
  try{const {data,error}=await sb.auth.signUp({email:v('email').toLowerCase(),password:v('password'),options:{data:metadata,emailRedirectTo:new URL('portal.html',location.href).href}});if(error)throw error;if(data.session){
    // Se o e-mail já tinha um convite pendente, o cadastro próprio pode ter
    // reutilizado a conta existente. Nesse caso, sincroniza a senha escolhida
    // pelo próprio usuário, sem pedir que ele crie outra senha.
    try{
     const {data:{user:createdUser}}=await sb.auth.getUser();
     if(createdUser){
      const {data:existingProfile}=await sb.from('profiles').select('must_set_password').eq('id',createdUser.id).maybeSingle();
      if(existingProfile?.must_set_password===true){
       const {data:setupData,error:setupError}=await sb.functions.invoke('admin-users',{body:{action:'complete_setup',password:v('password')}});
       if(setupError)throw setupError;if(setupData?.error)throw new Error(setupData.error);
      }
     }
    }catch(setupError){console.warn('Não foi possível concluir automaticamente o primeiro acesso:',setupError);}
    msg('Conta criada! Abrindo sua área...', 'success');setTimeout(()=>location.replace('portal.html'),900);
   }else{ $('customerForm').classList.add('hidden');msg('Cadastro recebido! Enviamos um e-mail de confirmação. Abra o link para confirmar seu endereço e depois entre no portal.','success');}}
  catch(err){const m=String(err.message||'Erro inesperado.');msg(/already registered|already been registered/i.test(m)?'Este e-mail já possui cadastro. Entre no portal ou utilize “Esqueci minha senha”.':m,'error');b.disabled=false;}
 });
})();
