(function(){
 const root=document.documentElement;
 const media=window.matchMedia?window.matchMedia('(prefers-color-scheme: dark)'):null;
 let sessionOverride=null;

 function systemTheme(){
  return media&&media.matches?'dark':'light';
 }
 function apply(value){
  const theme=value==='dark'||value==='light'?value:systemTheme();
  root.setAttribute('data-theme',theme);
  const meta=document.querySelector('meta[name="color-scheme"]');
  if(meta)meta.setAttribute('content',theme);
  document.querySelectorAll('[data-theme-toggle],#themeToggle').forEach(b=>{
   b.setAttribute('aria-label',theme==='dark'?'Ativar modo claro':'Ativar modo noturno');
   b.setAttribute('title',theme==='dark'?'Ativar modo claro':'Ativar modo noturno');
   b.setAttribute('aria-pressed',theme==='dark'?'true':'false');
  });
 }

 // A cada nova abertura, o tema inicial sempre acompanha o sistema.
 apply(null);

 // Se o usuário mudar a preferência do sistema durante a visita,
 // acompanha a mudança enquanto não houver escolha manual nesta sessão.
 if(media){
  const onChange=()=>{
   if(sessionOverride===null)apply(null);
  };
  if(media.addEventListener)media.addEventListener('change',onChange);
  else if(media.addListener)media.addListener(onChange);
 }

 // A escolha manual vale somente até a próxima abertura/recarga do site.
 document.addEventListener('click',e=>{
  const b=e.target.closest('[data-theme-toggle],#themeToggle');
  if(!b)return;
  sessionOverride=root.getAttribute('data-theme')==='dark'?'light':'dark';
  apply(sessionOverride);
 });
})();