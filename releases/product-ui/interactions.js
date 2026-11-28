(() => {
  const key='arslan-ui-sound';
  let enabled=true, audio, last=0;
  try {enabled=localStorage.getItem(key)!=='off';}catch{}
  const button=document.createElement('button');
  button.type='button';button.className='ui-sound';
  function label() {
    const ru=document.documentElement.lang==='ru';
    button.setAttribute('aria-label',ru?'Звук нажатий':'Bosish ovozi');
    button.title=button.getAttribute('aria-label');
    button.setAttribute('aria-pressed',String(enabled));
    button.textContent=enabled?'♪':'♩';
  }
  function tap() {
    if(!enabled||document.hidden||performance.now()-last<65)return;
    last=performance.now();
    try {
      const Audio=window.AudioContext||window.webkitAudioContext;
      if(!Audio)return;
      audio??=new Audio();
      if(audio.state==='suspended')audio.resume().catch(()=>{});
      const tone=audio.createOscillator(),gain=audio.createGain(),now=audio.currentTime;
      tone.type='sine';tone.frequency.setValueAtTime(1150,now);
      tone.frequency.exponentialRampToValueAtTime(720,now+.035);
      gain.gain.setValueAtTime(0,now);
      gain.gain.linearRampToValueAtTime(.035,now+.003);
      gain.gain.exponentialRampToValueAtTime(.0001,now+.045);
      tone.connect(gain);gain.connect(audio.destination);tone.start(now);tone.stop(now+.05);
      tone.onended=()=>{tone.disconnect();gain.disconnect();};
    }catch{}
  }
  label();
  button.addEventListener('click',()=>{
    enabled=!enabled;try{localStorage.setItem(key,enabled?'on':'off');}catch{}
    label();tap();
  });
  const host=document.querySelector('.tg-head');
  if(host)host.append(button);
  new MutationObserver(label).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  document.addEventListener('click',event=>{
    const el=event.target.closest?.('[data-category],[data-product],[data-service],[data-core-product],[data-widget-tab],#bottom-nav button');
    if(el&&!el.disabled)tap();
  },true);
})();