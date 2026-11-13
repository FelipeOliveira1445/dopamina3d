(function(){
 const root=document.documentElement, key='dopamina3d-theme';
 const media=window.matchMedia?window.matchMedia('(prefers-color-scheme: dark)'):null;
 function saved(){try{return localStorage.getItem(key)}catch(e){return null}}
 function apply(value){
  const theme=value==='dark'||value==='light'?value:(media&&media.matches?'dark':'light');
  root.setAttribute('data-theme',theme);
  const meta=document.querySelector('meta[name="color-scheme"]');
  if(meta)meta.setAttribute('content',theme);
  document.querySelectorAll('[data-theme-toggle]').forEach(b=>{
   b.setAttribute('aria-label',theme==='dark'?'Ativar modo claro':'Ativar modo noturno');
   b.setAttribute('title',theme==='dark'?'Ativar modo claro':'Ativar modo noturno');
   b.setAttribute('aria-pressed',theme==='dark'?'true':'false');
  });
 }
 apply(saved());
 if(media){const onChange=()=>{if(!saved())apply(null)};if(media.addEventListener)media.addEventListener('change',onChange);else if(media.addListener)media.addListener(onChange);}
 document.addEventListener('click',e=>{
  const b=e.target.closest('[data-theme-toggle],#themeToggle');
  if(!b)return;
  const next=root.getAttribute('data-theme')==='dark'?'light':'dark';
  try{localStorage.setItem(key,next)}catch(e){}
  apply(next);
 });
 window.addEventListener('storage',e=>{if(e.key===key)apply(e.newValue)});
})();