// Synthesised Afrobeat-style music, engine and effects (WebAudio, no audio files).
export const mtof=n=>440*Math.pow(2,(n-69)/12);
export const AudioSys={
  settings:{music:true,sfx:true},
  ctx:null,step:0,bar:0,nextTime:0,timer:null,theme:{bpm:100,root:45,prog:[0,8,3,10]},full:false,
  init(){if(this.ctx)return true;const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return false;try{this.ctx=new AC();}catch(e){return false;}
    const c=this.ctx;this.master=c.createGain();this.master.gain.value=.8;this.master.connect(c.destination);
    this.music=c.createGain();this.music.connect(this.master);this.sfx=c.createGain();this.sfx.connect(this.master);this.applyVol();
    const len=c.sampleRate;const b=c.createBuffer(1,len,c.sampleRate);const d=b.getChannelData(0);for(let i=0;i<len;i++)d[i]=Math.random()*2-1;this.noise=b;
    this.eOsc=c.createOscillator();this.eOsc.type='sawtooth';this.eOsc2=c.createOscillator();this.eOsc2.type='square';this.eF=c.createBiquadFilter();this.eF.type='lowpass';this.eF.frequency.value=700;this.eG=c.createGain();this.eG.gain.value=0;
    this.eOsc.connect(this.eF);this.eOsc2.connect(this.eF);this.eF.connect(this.eG);this.eG.connect(this.sfx);this.eOsc.start();this.eOsc2.start();return true;},
  unlock(){if(!this.init())return;if(this.ctx.state==='suspended')this.ctx.resume().catch(()=>{});},
  applyVol(){if(!this.ctx)return;this.music.gain.value=this.settings.music?.42:0;this.sfx.gain.value=this.settings.sfx?.9:0;},
  play(theme,full){if(!this.ctx)return;this.theme=theme;this.full=full;if(this.timer)return;this.step=0;this.bar=0;this.nextTime=this.ctx.currentTime+.08;this.timer=setInterval(()=>this.schedule(),25);},
  stop(){clearInterval(this.timer);this.timer=null;},
  schedule(){const c=this.ctx;if(!c||c.state!=='running')return;const spb=60/this.theme.bpm/4;if(this.nextTime<c.currentTime-.2)this.nextTime=c.currentTime+.05;
    while(this.nextTime<c.currentTime+.12){this.playStep(this.step,this.nextTime);this.nextTime+=spb;this.step=(this.step+1)%16;if(this.step===0)this.bar=(this.bar+1)%8;}},
  playStep(s,t){
    const th=this.theme,full=this.full,b=this.bar,chord=th.root+th.prog[Math.floor(b/2)%4];
    if(s===0||s===8||(s===10&&b%2===1)||(s===14&&b%4===3))this.kick(t);
    if(full&&(s===4||s===12))this.clap(t);
    if(s===3||s===6||s===11||s===14)this.rim(t,(s===3||s===11)?.5:.32);
    this.shaker(t,s%2?.2:(s%4===2?.13:.07));
    const bp={0:0,3:0,6:7,8:12,10:10,13:7};if(bp[s]!==undefined&&(full||s<8))this.bass(t,chord-12+bp[s]);
    if(full&&(s%2===1)){const pent=[0,3,5,7,10,12,15];const arp=[4,2,3,1,4,5,3,2];this.pluck(t,th.root+24+pent[arp[(s+b*3)%8]%7]);}
    if(!full&&s%4===2){const pent=[0,3,7,10,12];this.pluck(t,th.root+24+pent[(s/2+b)%5|0],.05);}
    if(full&&b%4>=2&&(s===2||s===9||s===13))this.logdrum(t,chord+12+[0,7,5][[2,9,13].indexOf(s)]);
    if(s===0&&b%2===0)this.pad(t,chord+12,60/th.bpm*8);
  },
  osc(t,type,f,dur,vol,dest,att){const c=this.ctx,o=c.createOscillator(),g=c.createGain();o.type=type;o.frequency.setValueAtTime(f,t);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(vol,t+(att||.005));g.gain.exponentialRampToValueAtTime(.0001,t+dur);o.connect(g);g.connect(dest||this.music);o.start(t);o.stop(t+dur+.05);return o;},
  nz(t,type,f,q,dur,vol,dest){const c=this.ctx,s=c.createBufferSource();s.buffer=this.noise;const fl=c.createBiquadFilter();fl.type=type;fl.frequency.value=f;fl.Q.value=q;const g=c.createGain();g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.0001,t+dur);s.connect(fl);fl.connect(g);g.connect(dest||this.music);s.start(t,Math.random()*.5);s.stop(t+dur+.02);return fl;},
  kick(t){const c=this.ctx,o=c.createOscillator(),g=c.createGain();o.frequency.setValueAtTime(150,t);o.frequency.exponentialRampToValueAtTime(42,t+.13);g.gain.setValueAtTime(.9,t);g.gain.exponentialRampToValueAtTime(.001,t+.32);o.connect(g);g.connect(this.music);o.start(t);o.stop(t+.34);},
  clap(t){this.nz(t,'bandpass',1500,.9,.16,.55);this.nz(t+.012,'bandpass',1900,.9,.1,.35);},
  rim(t,v){this.osc(t,'triangle',790,.05,v*.45);this.nz(t,'highpass',3000,.5,.02,v*.3);},
  shaker(t,v){this.nz(t,'highpass',7000,.6,.045,v*.7);},
  bass(t,n){const c=this.ctx,o=c.createOscillator(),f=c.createBiquadFilter(),g=c.createGain();o.type='sawtooth';o.frequency.value=mtof(n);f.type='lowpass';f.frequency.setValueAtTime(700,t);f.frequency.exponentialRampToValueAtTime(140,t+.25);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.42,t+.01);g.gain.exponentialRampToValueAtTime(.0001,t+.3);o.connect(f);f.connect(g);g.connect(this.music);o.start(t);o.stop(t+.34);},
  pluck(t,n,v){const c=this.ctx,o=c.createOscillator(),f=c.createBiquadFilter(),g=c.createGain();o.type='square';o.frequency.value=mtof(n);f.type='lowpass';f.frequency.setValueAtTime(3200,t);f.frequency.exponentialRampToValueAtTime(600,t+.15);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(v||.07,t+.004);g.gain.exponentialRampToValueAtTime(.0001,t+.18);o.connect(f);f.connect(g);g.connect(this.music);o.start(t);o.stop(t+.2);},
  logdrum(t,n){const c=this.ctx,o=c.createOscillator(),g=c.createGain();o.type='sine';o.frequency.setValueAtTime(mtof(n)*1.6,t);o.frequency.exponentialRampToValueAtTime(mtof(n),t+.04);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.32,t+.008);g.gain.exponentialRampToValueAtTime(.0001,t+.38);o.connect(g);g.connect(this.music);o.start(t);o.stop(t+.4);},
  pad(t,n,dur){for(const iv of [0,3,7]){const o=this.osc(t,'triangle',mtof(n+iv),dur,.035,this.music,.4);}},
  setEngine(on,pct,nos){if(!this.ctx)return;const t=this.ctx.currentTime;this.eG.gain.setTargetAtTime(on?.05+pct*.04:0,t,.08);const gp=Math.min(pct*5,4.999),gear=Math.floor(gp),rpm=gp-gear;const f=52+rpm*70+gear*13+(nos?18:0);this.eOsc.frequency.setTargetAtTime(f,t,.05);this.eOsc2.frequency.setTargetAtTime(f*.5,t,.05);this.eF.frequency.setTargetAtTime(450+pct*1500+(nos?600:0),t,.1);},
  sfxOk(){return this.ctx&&this.settings.sfx;},
  coin(){if(!this.sfxOk())return;const t=this.ctx.currentTime;this.osc(t,'sine',1320,.08,.25,this.sfx);this.osc(t+.06,'sine',1980,.14,.22,this.sfx);},
  crash(){if(!this.sfxOk())return;const t=this.ctx.currentTime;this.nz(t,'lowpass',900,.7,.45,.9,this.sfx);this.osc(t,'sine',90,.25,.6,this.sfx);},
  thud(){if(!this.sfxOk())return;const t=this.ctx.currentTime;this.osc(t,'sine',70,.18,.6,this.sfx);this.nz(t,'lowpass',400,.7,.15,.4,this.sfx);},
  horn(){if(!this.sfxOk())return;const t=this.ctx.currentTime;for(const k of [0,.2]){this.osc(t+k,'square',392,.16,.12,this.sfx,.01);this.osc(t+k,'square',494,.16,.1,this.sfx,.01);}},
  beep(hi){if(!this.sfxOk())return;const t=this.ctx.currentTime;this.osc(t,'sine',hi?990:620,hi?.45:.18,.3,this.sfx);},
  nitro(){if(!this.sfxOk())return;const t=this.ctx.currentTime;const f=this.nz(t,'bandpass',500,1.5,.7,.6,this.sfx);f.frequency.exponentialRampToValueAtTime(3500,t+.6);},
  chime(){if(!this.sfxOk())return;const t=this.ctx.currentTime;[0,4,7,12].forEach((iv,i)=>this.osc(t+i*.07,'triangle',mtof(72+iv),.25,.18,this.sfx));},
  bad(){if(!this.sfxOk())return;const t=this.ctx.currentTime;this.osc(t,'sawtooth',220,.25,.15,this.sfx);this.osc(t+.18,'sawtooth',165,.35,.15,this.sfx);},
};

