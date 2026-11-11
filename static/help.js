const button=document.getElementById('help-theme');
function label() {
  const dark=document.documentElement.dataset.theme==='dark';
  button.textContent=dark ? 'Light mode' : 'Dark mode';
  button.setAttribute('aria-pressed',String(dark));
}
button.addEventListener('click',()=>{
  const theme=document.documentElement.dataset.theme==='dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme=theme;
  try {localStorage.setItem('saxophone-sight-reader-theme',theme);} catch {}
  label();
});
label();

document.getElementById('help-close').addEventListener('click',()=>window.close());
