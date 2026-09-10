export class GameAudio {
  constructor(){this.enabled=false;}
  async toggle(){
    if(!this.ctx){
      this.ctx=new AudioContext();this.master=this.ctx.createGain();this.master.gain.value=0;this.master.connect(this.ctx.destination);
      const buffer=this.ctx.createBuffer(1,this.ctx.sampleRate*3,this.ctx.sampleRate),data=buffer.getChannelData(0);let last=0;
      for(let i=0;i<data.length;i++){last=(last+.025*(Math.random()*2-1))/1.025;data[i]=last*3;}
      const source=this.ctx.createBufferSource();source.buffer=buffer;source.loop=true;
      const filter=this.ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=650;
      const gain=this.ctx.createGain();gain.gain.value=.12;source.connect(filter).connect(gain).connect(this.master);source.start();
    }
    await this.ctx.resume();this.enabled=!this.enabled;this.master.gain.setTargetAtTime(this.enabled?.28:0,this.ctx.currentTime,.12);return this.enabled;
  }
  effect(type,volume=1){
    if(!this.enabled||!this.ctx)return;
    const ctx=this.ctx,now=ctx.currentTime;
    if(type==='shot'||type==='hit'||type==='sink'){
      const duration=type==='sink'?.6:.15,buffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*duration),ctx.sampleRate),data=buffer.getChannelData(0);
      for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*(1-i/data.length)**2;
      const src=ctx.createBufferSource();src.buffer=buffer;const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=type==='shot'?1000:type==='sink'?400:2000;const gain=ctx.createGain();gain.gain.value=.55*volume;src.connect(filter).connect(gain).connect(this.master);src.start();
    } else if(type==='pickup'||type==='warning'){
      const osc=ctx.createOscillator(),gain=ctx.createGain();osc.type='sine';osc.frequency.setValueAtTime(type==='pickup'?520:240,now);osc.frequency.exponentialRampToValueAtTime(type==='pickup'?880:330,now+.15);gain.gain.setValueAtTime(.22*volume,now);gain.gain.exponentialRampToValueAtTime(.001,now+.3);osc.connect(gain).connect(this.master);osc.start();osc.stop(now+.3);
    }
  }
}
